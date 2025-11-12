
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
                // Skip items that don't have a storeId, though in pujasera context they should.
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
        const createdTransactions: Transaction[] = [];

        // Create a separate transaction for each tenant
        for (const tenantId in itemsByTenant) {
            const tenantItems = itemsByTenant[tenantId];
            const tenantSubtotal = tenantItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

            // Note: Tax and service fee are calculated on the frontend for the whole cart.
            // For simplicity here, we're not recalculating per-tenant tax/service fee,
            // but we are creating separate transactions.
            // This simplification is acceptable for kitchen processing.

            const tenantStoreRef = db.collection('stores').doc(tenantId);
            const tenantStoreSnap = await tenantStoreRef.get();
            if (!tenantStoreSnap.exists) {
                console.error(`Tenant store with ID ${tenantId} not found. Skipping.`);
                continue;
            }
            
            const currentCounter = tenantStoreSnap.data()?.transactionCounter || 0;
            const newReceiptNumber = currentCounter + 1;
            
            // Increment tenant's transaction counter
            batch.update(tenantStoreRef, { transactionCounter: FieldValue.increment(1) });
            
            // Create the new transaction document in the tenant's subcollection
            const newTransactionRef = db.collection('stores').doc(tenantId).collection('transactions').doc();
            
            const newTransactionData: Omit<Transaction, 'id'> = {
                receiptNumber: newReceiptNumber,
                storeId: tenantId, // The ID of the tenant, not the pujasera
                customerId: customer.id,
                customerName: customer.name,
                staffId: 'CATALOG_SYSTEM', // System-generated transaction
                createdAt: new Date().toISOString(),
                items: tenantItems,
                subtotal: tenantSubtotal,
                // These financial details are simplified for this split transaction
                discountAmount: 0,
                taxAmount: 0, 
                serviceFeeAmount: 0,
                totalAmount: tenantSubtotal, 
                paymentMethod: 'Belum Dibayar', // They pay at the central cashier
                status: 'Diproses', // <<<<<<<<<<<< KEY CHANGE: This makes it appear in the kitchen
                pointsEarned: 0, // Points are calculated at final checkout
                pointsRedeemed: 0,
                // We can add a reference to the overall order if needed later
                // e.g., parentOrderId: some-unique-id-for-the-whole-cart
            };
            
            batch.set(newTransactionRef, newTransactionData);
            createdTransactions.push({ id: newTransactionRef.id, ...newTransactionData });
        }

        await batch.commit();

        return NextResponse.json({ 
            success: true, 
            message: `Pesanan berhasil dikirim ke ${Object.keys(itemsByTenant).length} tenant.`,
            transactions: createdTransactions 
        });

    } catch (error) {
        console.error('Error creating distributed catalog order:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
