import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
import type { OrderPayload, Table, TableOrder } from '@/lib/types';
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
        
        const newVirtualTableRef = db.collection('stores').doc(pujaseraId).collection('tables').doc();

        // The order object to be stored in the virtual table
        const orderForTable: TableOrder = {
            items: cart, // The full cart with items from various tenants
            totalAmount: totalAmount,
            orderTime: new Date().toISOString(),
            customer: {
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                avatarUrl: customer.avatarUrl
            },
            paymentMethod: paymentMethod, // Save the chosen payment method
        };

        const currentCounter = (await pujaseraStoreRef.get()).data()?.virtualTableCounter || 0;
        const newCounter = currentCounter + 1;
        
        // Data for the new virtual table document
        const newTableData: Omit<Table, 'id'> = {
            name: `Virtual #${newCounter}`,
            capacity: 1, // Virtual tables have a capacity of 1
            status: 'Terisi', // Immediately set to 'Terisi' as it has an order
            isVirtual: true,
            currentOrder: orderForTable,
        };

        const batch = db.batch();
        
        // Set the new table data
        batch.set(newVirtualTableRef, newTableData);
        
        // Increment the counter for the next virtual table
        batch.update(pujaseraStoreRef, { virtualTableCounter: FieldValue.increment(1) });

        await batch.commit();

        return NextResponse.json({ 
            success: true, 
            message: `Pesanan berhasil dibuat dan ditempatkan di meja virtual ${newTableData.name}.`,
            table: { id: newVirtualTableRef.id, ...newTableData }
        });

    } catch (error) {
        console.error('Error creating virtual table order:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
