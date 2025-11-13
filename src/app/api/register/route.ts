
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  const { db } = getFirebaseAdmin();
  
  const { 
    pujaseraName, 
    pujaseraLocation, 
    adminName, 
    email, 
    whatsapp, 
    password, 
    referralCode 
  } = await req.json();

  if (!pujaseraName || !pujaseraLocation || !adminName || !email || !whatsapp || !password) {
    return NextResponse.json({ error: 'Missing required registration data.' }, { status: 400 });
  }

  try {
    // Queue the registration job for the Cloud Function to process
    const pujaseraQueueRef = db.collection('Pujaseraqueue').doc();
    await pujaseraQueueRef.set({
      type: 'pujasera-registration',
      payload: {
        pujaseraName,
        pujaseraLocation,
        adminName,
        email,
        whatsapp,
        password,
        referralCode,
      },
      // The createdAt timestamp will be added by the Cloud Function
    });

    console.info(`Queued new pujasera registration for ${email}`);
    
    return NextResponse.json({ success: true, message: 'Registration queued successfully.' });

  } catch (error: any) {
    console.error('Error queuing pujasera registration:', error);
    return NextResponse.json({ error: 'Failed to queue registration job.' }, { status: 500 });
  }
}
