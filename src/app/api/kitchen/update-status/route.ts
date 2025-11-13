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
    const decodedToken = await auth.verifyIdToken(idToken);
    
    // Ensure the user has the right to perform this action (e.g., is a tenant admin/kitchen staff)
    const allowedRoles = ['admin', 'kitchen', 'pujasera_admin', 'pujasera_cashier'];
    if (!decodedToken.role || !allowedRoles.includes(decodedToken.role)) {
        return NextResponse.json({ error: 'Permission denied.' }, { status: 403 });
    }

    const { tenantId, pujaseraId, parentTransactionId } = await req.json();

    if (!tenantId || !pujaseraId || !parentTransactionId) {
      return NextResponse.json({ error: 'Missing required IDs' }, { status: 400 });
    }
    
    // Run a transaction to ensure atomicity
    await db.runTransaction(async (transaction) => {
        // 1. Find the sub-transaction document for the tenant
        const subTransactionQuery = db.collection('stores').doc(tenantId).collection('transactions').where('parentTransactionId', '==', parentTransactionId);
        const subTransactionSnapshot = await transaction.get(subTransactionQuery);

        if (subTransactionSnapshot.empty) {
            throw new Error(`Sub-transaksi untuk tenant ${tenantId} dengan nota induk ${parentTransactionId} tidak ditemukan.`);
        }
        const subTransactionRef = subTransactionSnapshot.docs[0].ref;

        // 2. Find the main pujasera transaction document
        const mainTransactionRef = db.collection('stores').doc(pujaseraId).collection('transactions').doc(parentTransactionId);

        // 3. Update both documents within the transaction
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
