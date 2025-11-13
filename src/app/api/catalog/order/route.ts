import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
import type { OrderPayload, Table, TableOrder, Transaction } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
    const { db } = getFirebaseAdmin();
    try {
        const payload: OrderPayload = await req.json();
        const { storeId: pujaseraId, customer, cart, subtotal, taxAmount, serviceFeeAmount, totalAmount, paymentMethod } = payload;

        if (!pujaseraId || !customer || !cart || cart.length === 0 || !paymentMethod) {
            return NextResponse.json({ error: 'Data pesanan tidak lengkap.' }, { status: 400 });
        }

        const pujaseraStoreRef = db.collection('stores').doc(pujaseraId);
        
        const pujaseraStoreDoc = await pujaseraStoreRef.get();
        if (!pujaseraStoreDoc.exists) {
            throw new Error("Pujasera tidak ditemukan.");
        }

        const batch = db.batch();
        
        let tableIdForOrder: string | undefined = undefined;
        let finalTableData: Partial<Table> | null = null;
        let newTableRef;

        // If payment is at the cashier, create a virtual table as a marker
        if (paymentMethod === 'kasir') {
            const pujaseraData = pujaseraStoreDoc.data()!;
            const virtualTableCounter = pujaseraData.virtualTableCounter || 0;
            const virtualTableName = `WEB-${virtualTableCounter + 1}`;
            
            newTableRef = db.collection('stores').doc(pujaseraId).collection('tables').doc();
            tableIdForOrder = newTableRef.id;

            const tableOrder: TableOrder = {
                items: cart,
                totalAmount: totalAmount,
                orderTime: new Date().toISOString(),
                customer: { id: customer.id, name: customer.name, phone: customer.phone, avatarUrl: customer.avatarUrl },
                paymentMethod: 'kasir',
            };
            
            finalTableData = {
                name: virtualTableName,
                status: 'Terisi',
                capacity: 1,
                isVirtual: true,
                currentOrder: tableOrder
            };

            batch.set(newTableRef, finalTableData);
            batch.update(pujaseraStoreRef, { virtualTableCounter: FieldValue.increment(1) });
        }
        
        // Queue the order for processing by the Cloud Function
        const pujaseraQueueRef = db.collection('Pujaseraqueue').doc();
        batch.set(pujaseraQueueRef, {
            type: 'pujasera-order',
            payload: {
                ...payload,
                tableId: tableIdForOrder, // Pass the newly created tableId if applicable
                isFromCatalog: true
            },
            createdAt: FieldValue.serverTimestamp(),
        });

        await batch.commit();

        const message = paymentMethod === 'kasir'
            ? `Pesanan berhasil dibuat. Silakan bayar di kasir dengan menyebutkan nama Anda.`
            : `Pesanan berhasil dibuat dan akan segera diproses setelah pembayaran dikonfirmasi.`;

        // Return table data so client can create a local active order session
        return NextResponse.json({ 
            success: true, 
            message,
            table: finalTableData ? { id: tableIdForOrder, ...finalTableData } : null,
        });

    } catch (error) {
        console.error('Error creating catalog order:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
