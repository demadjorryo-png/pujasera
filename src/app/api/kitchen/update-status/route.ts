
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
import { doc } from 'firebase-admin/firestore';

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
        // Query only by parentTransactionId to avoid needing a composite index
        const subTransactionQuery = db.collectionGroup('transactions')
            .where('parentTransactionId', '==', parentTransactionId);

        const subTransactionSnapshot = await transaction.get(subTransactionQuery);

        // Filter for the correct tenant in memory
        const subTransactionDoc = subTransactionSnapshot.docs.find(doc => doc.data().storeId === tenantId);

        if (!subTransactionDoc) {
            throw new Error(`Sub-transaksi untuk tenant ${tenantId} dengan nota induk ${parentTransactionId} tidak ditemukan.`);
        }

        const subTransactionRef = subTransactionDoc.ref;
        const mainTransactionRef = doc(db, 'stores', pujaseraId, 'transactions', parentTransactionId);

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
