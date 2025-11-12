import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
import { PlaceHolderImages } from '@/lib/placeholder-images';

// Helper function to format phone numbers consistently
function formatPhoneNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = '62' + cleaned.substring(1);
    } else if (!cleaned.startsWith('62')) {
        cleaned = '62' + cleaned;
    }
    return cleaned;
}

export async function POST(req: NextRequest) {
    const { db } = getFirebaseAdmin();
    try {
        const { phone, name, storeId, birthDate } = await req.json();

        if (!phone || !storeId) {
            return NextResponse.json({ error: 'Nomor HP dan ID Toko diperlukan.' }, { status: 400 });
        }
        
        const formattedPhone = formatPhoneNumber(phone);
        // Customer collection is now under the specific store
        const customerCollectionRef = db.collection('stores').doc(storeId).collection('customers');
        const q = customerCollectionRef.where('phone', '==', formattedPhone).limit(1);

        const querySnapshot = await q.get();

        if (!querySnapshot.empty) {
            // Customer exists, return their data (Login)
            const customerDoc = querySnapshot.docs[0];
            const customerData = { id: customerDoc.id, ...customerDoc.data() };
            return NextResponse.json({ status: 'login_success', customer: customerData });
        } else {
            // Customer does not exist
            if (name) {
                // If name is provided, create new customer (Register)
                const avatarUrl = PlaceHolderImages[Math.floor(Math.random() * PlaceHolderImages.length)].imageUrl;
                const newCustomerData = {
                    name,
                    phone: formattedPhone,
                    joinDate: new Date().toISOString(),
                    birthDate: birthDate || new Date(0).toISOString().split('T')[0], // Use provided or default date
                    loyaltyPoints: 0,
                    memberTier: 'Bronze' as const,
                    avatarUrl,
                };
                const newCustomerRef = await customerCollectionRef.add(newCustomerData);
                const finalCustomerData = { id: newCustomerRef.id, ...newCustomerData };
                
                return NextResponse.json({ status: 'register_success', customer: finalCustomerData }, { status: 201 });
            } else {
                // If name is not provided, prompt for registration
                return NextResponse.json({ status: 'not_found' });
            }
        }

    } catch (error) {
        console.error('Error in customer-auth API:', error);
        return NextResponse.json({ error: 'Terjadi kesalahan pada server.' }, { status: 500 });
    }
}
