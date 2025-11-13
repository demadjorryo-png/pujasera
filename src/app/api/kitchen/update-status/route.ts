
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';

export async function POST(req: NextRequest) {
  const { auth, db } = getFirebaseAdmin();

  try {
    const idToken = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!idToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await auth.verifyIdToken(idToken);
    
    const { tenantId, pujaseraId, parentTransactionId } = await req.json();

    if (!tenantId || !pujaseraId || !parentTransactionId) {
      return NextResponse.json({ error: 'Missing required IDs' }, { status: 400 });
    }
    
    await db.runTransaction(async (transaction) => {
        // Construct the predictable ID for the sub-transaction
        const subTransactionId = `${parentTransactionId}_${tenantId}`;
        const subTransactionRef = db.collection('stores').doc(tenantId).collection('transactions').doc(subTransactionId);
        
        // Directly get the sub-transaction document
        const subTransactionDoc = await transaction.get(subTransactionRef);

        if (!subTransactionDoc.exists) {
            throw new Error(`Sub-transaksi untuk tenant ${tenantId} dengan nota induk ${parentTransactionId} tidak ditemukan.`);
        }
        
        const mainTransactionRef = db.collection('stores').doc(pujaseraId).collection('transactions').doc(parentTransactionId);

        // Update both documents in the same transaction
        transaction.update(subTransactionRef, { status: 'Siap Diambil' });
        transaction.update(mainTransactionRef, {
            [`itemsStatus.${tenantId}`]: 'Siap Diambil'
        });
    });

    return NextResponse.json({ success: true, message: 'Status updated successfully.' });

  } catch (error) {
    console.error('Error updating kitchen status:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
