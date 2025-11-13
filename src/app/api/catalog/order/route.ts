
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
        
        // --- START: Fix for Transaction Error ---
        // 1. Read the document FIRST, outside the transaction.
        const pujaseraStoreDoc = await pujaseraStoreRef.get();
        if (!pujaseraStoreDoc.exists) {
            throw new Error("Pujasera tidak ditemukan.");
        }

        // 2. Now, run the transaction with only WRITE operations.
        const result = await db.runTransaction(async (transaction) => {
            const pujaseraData = pujaseraStoreDoc.data()!;
            
            // Create the main transaction record immediately
            const pujaseraCounter = pujaseraData.transactionCounter || 0;
            const newReceiptNumber = pujaseraCounter + 1;
            
            const newTransactionData: Omit<Transaction, 'id'> = {
                receiptNumber: newReceiptNumber,
                storeId: pujaseraId,
                customerId: customer.id,
                customerName: customer.name,
                staffId: 'catalog-system', // Indicate it's from the catalog
                createdAt: new Date().toISOString(),
                items: cart.map(item => ({...item, storeId: item.storeId || ''})),
                subtotal, taxAmount, serviceFeeAmount, discountAmount: 0,
                totalAmount,
                paymentMethod: paymentMethod === 'qris' ? 'QRIS' : 'Belum Dibayar',
                status: 'Diproses', // Directly set to 'Diproses' to trigger kitchen function
                pointsEarned: 0, 
                pointsRedeemed: 0,
                pujaseraGroupSlug: pujaseraData.pujaseraGroupSlug,
                notes: 'Pesanan dari Katalog Publik'
            };

            const newTxRef = db.collection('stores').doc(pujaseraId).collection('transactions').doc();
            transaction.set(newTxRef, newTransactionData);
            
            // Increment the transaction counter
            transaction.update(pujaseraStoreRef, { transactionCounter: FieldValue.increment(1) });

            // If payment is at the cashier, create a virtual table as a marker
            if (paymentMethod === 'kasir') {
                const virtualTableCounter = pujaseraData.virtualTableCounter || 0;
                const virtualTableName = `WEB-${virtualTableCounter + 1}`;
                
                const newTableRef = db.collection('stores').doc(pujaseraId).collection('tables').doc();
                const tableOrder: TableOrder = {
                    items: cart,
                    totalAmount: totalAmount,
                    orderTime: new Date().toISOString(),
                    customer: { id: customer.id, name: customer.name, phone: customer.phone, avatarUrl: customer.avatarUrl },
                    transactionId: newTxRef.id, // Link to the created transaction
                    paymentMethod: 'kasir',
                };
                
                const newTableData: Partial<Table> = {
                    name: virtualTableName,
                    status: 'Terisi', // Occupied because it's an active order
                    capacity: 1,
                    isVirtual: true,
                    currentOrder: tableOrder
                };

                transaction.set(newTableRef, newTableData);
                transaction.update(pujaseraStoreRef, { virtualTableCounter: FieldValue.increment(1) });
            }
            
            return {
                success: true,
                transactionId: newTxRef.id,
                receiptNumber: newReceiptNumber,
                tableCreated: paymentMethod === 'kasir',
            };
        });
        // --- END: Fix for Transaction Error ---

        const message = result.tableCreated
            ? `Pesanan #${result.receiptNumber} berhasil dibuat dan akan diproses. Silakan bayar di kasir.`
            : `Pesanan #${result.receiptNumber} berhasil dibuat. Silakan selesaikan pembayaran dan pesanan akan segera diproses.`;

        return NextResponse.json({ 
            success: true, 
            message: message,
            transactionId: result.transactionId
        });

    } catch (error) {
        console.error('Error creating catalog order:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
