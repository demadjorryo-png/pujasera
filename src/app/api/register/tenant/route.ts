
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  const { db } = getFirebaseAdmin();
  
  const { 
    storeName, 
    adminName, 
    email, 
    whatsapp, 
    password, 
    pujaseraGroupSlug,
  } = await req.json();

  if (!storeName || !adminName || !email || !whatsapp || !password || !pujaseraGroupSlug) {
    return NextResponse.json({ error: 'Missing required registration data.' }, { status: 400 });
  }

  try {
    // Queue the tenant registration job for the Cloud Function to process
    const pujaseraQueueRef = db.collection('Pujaseraqueue').doc();
    await pujaseraQueueRef.set({
        type: 'tenant-registration',
        payload: {
            storeName,
            adminName,
            email,
            whatsapp,
            password,
            pujaseraGroupSlug,
        },
        createdAt: FieldValue.serverTimestamp(),
    });

    console.info(`Queued new tenant registration for ${email}`);

    return NextResponse.json({ success: true, message: 'Tenant registration queued successfully.' });

  } catch (error: any) {
    console.error('Error queuing tenant registration:', error);
    return NextResponse.json({ error: 'Failed to queue tenant registration job.' }, { status: 500 });
  }
}
