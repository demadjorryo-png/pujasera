
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
import type { OrderPayload, CartItem, Transaction } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
    const { db } = getFirebaseAdmin();
    try {
        const payload: OrderPayload = await req.json();
        const { storeId: pujaseraId, customer, cart, subtotal, taxAmount, serviceFeeAmount, totalAmount } = payload;

        if (!pujaseraId || !customer || !cart || cart.length === 0) {
            return NextResponse.json({ error: 'Data pesanan tidak lengkap.' }, { status: 400 });
        }

        // Group cart items by their original tenant storeId
        const itemsByTenant = cart.reduce((acc, item) => {
            const tenantId = item.storeId;
            if (!tenantId) {
                console.warn(`Skipping item without storeId: ${item.productName}`);
                return acc;
            }
            if (!acc[tenantId]) {
                acc[tenantId] = [];
            }
            acc[tenantId].push(item);
            return acc;
        }, {} as Record<string, CartItem[]>);
        
        const batch = db.batch();
        const createdTransactionsForTenants: Transaction[] = [];

        // 1. Create a separate transaction for each tenant to appear in their kitchen
        for (const tenantId in itemsByTenant) {
            const tenantItems = itemsByTenant[tenantId];
            const tenantSubtotal = tenantItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

            const tenantStoreRef = db.collection('stores').doc(tenantId);
            const tenantStoreSnap = await tenantStoreRef.get();
            if (!tenantStoreSnap.exists()) {
                console.error(`Tenant store with ID ${tenantId} not found. Skipping.`);
                continue;
            }
            
            const currentCounter = tenantStoreSnap.data()?.transactionCounter || 0;
            const newReceiptNumber = currentCounter + 1;
            
            batch.update(tenantStoreRef, { transactionCounter: FieldValue.increment(1) });
            
            const newTransactionRef = db.collection('stores').doc(tenantId).collection('transactions').doc();
            
            const newTransactionData: Omit<Transaction, 'id'> = {
                receiptNumber: newReceiptNumber,
                storeId: tenantId,
                customerId: customer.id,
                customerName: customer.name,
                staffId: 'CATALOG_SYSTEM',
                createdAt: new Date().toISOString(),
                items: tenantItems,
                subtotal: tenantSubtotal,
                discountAmount: 0,
                taxAmount: 0, 
                serviceFeeAmount: 0,
                totalAmount: tenantSubtotal, 
                paymentMethod: 'Belum Dibayar',
                status: 'Diproses',
                pointsEarned: 0,
                pointsRedeemed: 0,
            };
            
            batch.set(newTransactionRef, newTransactionData);
            createdTransactionsForTenants.push({ id: newTransactionRef.id, ...newTransactionData });
        }

        // 2. Create a single parent transaction for the main pujasera cashier
        const pujaseraStoreRef = db.collection('stores').doc(pujaseraId);
        const pujaseraStoreSnap = await pujaseraStoreRef.get();
        if (!pujaseraStoreSnap.exists()) {
            throw new Error(`Pujasera store with ID ${pujaseraId} not found.`);
        }
        
        const pujaseraCounter = pujaseraStoreSnap.data()?.transactionCounter || 0;
        const pujaseraReceiptNumber = pujaseraCounter + 1;

        batch.update(pujaseraStoreRef, { transactionCounter: FieldValue.increment(1) });
        
        const parentTransactionRef = db.collection('stores').doc(pujaseraId).collection('transactions').doc();
        const parentTransactionData: Omit<Transaction, 'id'> = {
            receiptNumber: pujaseraReceiptNumber,
            storeId: pujaseraId,
            customerId: customer.id,
            customerName: customer.name,
            staffId: 'CATALOG_SYSTEM',
            createdAt: new Date().toISOString(),
            items: cart, // The full cart
            subtotal,
            taxAmount,
            serviceFeeAmount,
            discountAmount: 0,
            totalAmount,
            paymentMethod: 'Belum Dibayar',
            status: 'Belum Dibayar', // This status is for the cashier, not the kitchen
            pointsEarned: 0,
            pointsRedeemed: 0,
        };

        batch.set(parentTransactionRef, parentTransactionData);

        await batch.commit();

        return NextResponse.json({ 
            success: true, 
            message: `Pesanan berhasil dikirim ke ${Object.keys(itemsByTenant).length} tenant dan ke kasir pusat.`,
            tenantTransactions: createdTransactionsForTenants,
            parentTransactionId: parentTransactionRef.id,
        });

    } catch (error) {
        console.error('Error creating distributed catalog order:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
