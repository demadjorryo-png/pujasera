'use client';
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
        
        // --- START: New Logic to Create Transaction Directly ---
        const result = await db.runTransaction(async (transaction) => {
            const pujaseraStoreDoc = await transaction.get(pujaseraStoreRef);
            if (!pujaseraStoreDoc.exists) {
                throw new Error("Pujasera tidak ditemukan.");
            }
            
            const pujaseraCounter = pujaseraStoreDoc.data()?.transactionCounter || 0;
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
                paymentMethod: paymentMethod === 'qris' ? 'QRIS' : 'Belum Dibayar', // If QRIS, assume paid. Otherwise, pay at cashier.
                status: 'Diproses', // Directly set to 'Diproses' to trigger kitchen
                pointsEarned: 0, // Points are calculated by cashier later if needed
                pointsRedeemed: 0,
                pujaseraGroupSlug: pujaseraStoreDoc.data()?.pujaseraGroupSlug,
                notes: 'Pesanan dari Katalog Publik'
            };

            const newTxRef = db.collection('stores').doc(pujaseraId).collection('transactions').doc();
            transaction.set(newTxRef, newTransactionData);
            
            // Increment the transaction counter
            transaction.update(pujaseraStoreRef, { transactionCounter: FieldValue.increment(1) });
            
            return {
                success: true,
                transactionId: newTxRef.id,
                receiptNumber: newReceiptNumber
            };
        });
        // --- END: New Logic ---

        return NextResponse.json({ 
            success: true, 
            message: `Pesanan #${result.receiptNumber} berhasil dibuat dan sedang diproses oleh dapur.`,
            transactionId: result.transactionId
        });

    } catch (error) {
        console.error('Error creating catalog order transaction:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
