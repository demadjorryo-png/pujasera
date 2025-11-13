
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { UserRecord } from 'firebase-admin/auth';
import { getWhatsappSettings } from '@/lib/server/whatsapp-settings';

async function internalSendWhatsapp(deviceId: string, target: string, message: string, isGroup: boolean = false) {
    const formData = new FormData();
    formData.append('device_id', deviceId);
    formData.append(isGroup ? 'group' : 'number', target);
    formData.append('message', message);
    const endpoint = isGroup ? 'sendGroup' : 'send';
    const webhookUrl = `https://app.whacenter.com/api/${endpoint}`;

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const responseJson = await response.json();
            console.error('WhaCenter API HTTP Error:', { status: response.status, body: responseJson });
        } else {
            const responseJson = await response.json();
            if (responseJson.status === 'error') {
                console.error('WhaCenter API Error:', responseJson.reason);
            }
        }
    } catch (error) {
        console.error("Failed to send WhatsApp message:", error);
    }
}

function formatWhatsappNumber(nomor: string | number): string {
    if (!nomor) return '';
    let nomorStr = String(nomor).replace(/\D/g, '');
    if (nomorStr.startsWith('0')) {
        return '62' + nomorStr.substring(1);
    }
    if (nomorStr.startsWith('8')) {
        return '62' + nomorStr;
    }
    return nomorStr;
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

    // Send notifications directly
    const { deviceId, adminGroup } = getWhatsappSettings();
    if (deviceId) {
        const welcomeMessage = `🎉 *Selamat Datang di Chika POS, ${adminName}!* 🎉\n\nToko Anda *"${storeName}"* telah berhasil terdaftar di pujasera *${pujaseraData.name}* dengan bonus *${bonusTokens} Pradana Token*.\n\nSilakan login untuk mulai mengelola toko Anda.`;
        const adminMessage = `*TENANT BARU BERGABUNG*\n\n*Pujasera:* ${pujaseraData.name}\n*Tenant Baru:* ${storeName}\n*Admin Tenant:* ${adminName}\n*Email:* ${email}\n\nBonus ${bonusTokens} token telah diberikan.`;
        
        const formattedUserPhone = formatWhatsappNumber(whatsapp);
        await internalSendWhatsapp(deviceId, formattedUserPhone, welcomeMessage);
        
        if (adminGroup) {
            await internalSendWhatsapp(deviceId, adminGroup, adminMessage, true);
        }
    }
    
    return NextResponse.json({ success: true, message: 'Pendaftaran tenant berhasil!' });

  } catch (error: any) {
    if (newUser) {
      await auth.deleteUser(newUser.uid).catch(delErr => console.error(`Failed to clean up orphaned user ${newUser?.uid}`, delErr));
    }
    console.error('Error in tenant registration:', error);
    return NextResponse.json({ error: error.message || 'Gagal mendaftarkan tenant.' }, { status: 500 });
  }
}
