
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { UserRecord } from 'firebase-admin/auth';

// Helper function to queue notifications, as this is a non-critical side effect.
async function queueWhatsappNotification(to: string, message: string, isGroup: boolean = false) {
    const { db } = getFirebaseAdmin();
    const whatsappQueueRef = db.collection('Pujaseraqueue');
    await whatsappQueueRef.add({
      type: 'whatsapp-notification',
      payload: { to, message, isGroup },
    });
}

export async function POST(req: NextRequest) {
  const { auth, db } = getFirebaseAdmin();
  
  const { 
    storeName, 
    adminName, 
    email, 
    whatsapp, 
    password, 
    pujaseraGroupSlug,
  } = await req.json();

  if (!storeName || !adminName || !email || !whatsapp || !password || !pujaseraGroupSlug) {
    return NextResponse.json({ error: 'Data registrasi tidak lengkap.' }, { status: 400 });
  }

  let newUser: UserRecord | null = null;
  try {
    const pujaseraQuery = db.collection('stores').where('pujaseraGroupSlug', '==', pujaseraGroupSlug).limit(1);
    const pujaseraSnapshot = await pujaseraQuery.get();
    if (pujaseraSnapshot.empty) {
        throw new Error('Grup pujasera tidak ditemukan.');
    }
    const pujaseraDoc = pujaseraSnapshot.docs[0];
    const pujaseraData = pujaseraDoc.data();
    
    const feeSettingsDoc = await db.doc('appSettings/transactionFees').get();
    const feeSettings = feeSettingsDoc.data() || {};
    const bonusTokens = feeSettings.newTenantBonusTokens || 0;

    const userRecord = await auth.createUser({ email, password, displayName: adminName });
    newUser = userRecord;
    const uid = newUser.uid;
    
    await auth.setCustomUserClaims(uid, { role: 'admin' });

    const batch = db.batch();
    const newStoreRef = db.collection('stores').doc();
    batch.set(newStoreRef, {
        name: storeName,
        location: pujaseraData.location || '',
        pradanaTokenBalance: bonusTokens,
        adminUids: [uid],
        createdAt: new Date().toISOString(),
        transactionCounter: 0,
        firstTransactionDate: null,
        pujaseraGroupSlug,
        pujaseraName: pujaseraData.name || '',
        isPosEnabled: true,
        posMode: 'terpusat',
    });

    const userRef = db.collection('users').doc(uid);
    batch.set(userRef, {
        name: adminName,
        email,
        whatsapp,
        role: 'admin',
        status: 'active',
        storeId: newStoreRef.id,
    });

    await batch.commit();

    // Enqueue notifications
    const welcomeMessage = `🎉 *Selamat Datang di Chika POS, ${adminName}!* 🎉\n\nToko Anda *"${storeName}"* telah berhasil terdaftar di pujasera *${pujaseraData.name}* dengan bonus *${bonusTokens} Pradana Token*.\n\nSilakan login untuk mulai mengelola toko Anda.`;
    const adminMessage = `*TENANT BARU BERGABUNG*\n\n*Pujasera:* ${pujaseraData.name}\n*Tenant Baru:* ${storeName}\n*Admin Tenant:* ${adminName}\n*Email:* ${email}\n\nBonus ${bonusTokens} token telah diberikan.`;
    
    await queueWhatsappNotification(whatsapp, welcomeMessage);
    await queueWhatsappNotification('admin_group', adminMessage, true);
    
    return NextResponse.json({ success: true, message: 'Pendaftaran tenant berhasil!' });

  } catch (error: any) {
    if (newUser) {
      await auth.deleteUser(newUser.uid).catch(delErr => console.error(`Failed to clean up orphaned user ${newUser?.uid}`, delErr));
    }
    console.error('Error in tenant registration:', error);
    return NextResponse.json({ error: error.message || 'Gagal mendaftarkan tenant.' }, { status: 500 });
  }
}
