
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
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
    pujaseraName, 
    pujaseraLocation, 
    adminName, 
    email, 
    whatsapp, 
    password, 
    referralCode 
  } = await req.json();

  if (!pujaseraName || !pujaseraLocation || !adminName || !email || !whatsapp || !password) {
    return NextResponse.json({ error: 'Data registrasi tidak lengkap.' }, { status: 400 });
  }

  let newUser: UserRecord | null = null;
  try {
    const feeSettingsDoc = await db.doc('appSettings/transactionFees').get();
    const feeSettings = feeSettingsDoc.data() || {};
    const bonusTokens = feeSettings.newPujaseraBonusTokens || 0;

    const userRecord = await auth.createUser({ email, password, displayName: adminName });
    newUser = userRecord;
    const uid = newUser.uid;
    
    const pujaseraGroupSlug = pujaseraName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-').replace(/^-+/, '').replace(/-+$/, '') + '-' + Math.random().toString(36).substring(2, 7);
    const primaryStoreIdForAdmin = uid;

    await auth.setCustomUserClaims(uid, { role: 'pujasera_admin', pujaseraGroupSlug });

    const batch = db.batch();

    const storeRef = db.collection('stores').doc(primaryStoreIdForAdmin);
    batch.set(storeRef, {
        name: pujaseraName,
        location: pujaseraLocation,
        pradanaTokenBalance: bonusTokens,
        adminUids: [uid],
        createdAt: new Date().toISOString(),
        transactionCounter: 0,
        firstTransactionDate: null,
        referralCode: referralCode || '',
        pujaseraName,
        pujaseraLocation,
        pujaseraGroupSlug,
        catalogSlug: pujaseraGroupSlug,
        isPosEnabled: true,
    });

    const userRef = db.collection('users').doc(uid);
    batch.set(userRef, {
        name: adminName,
        email,
        whatsapp,
        role: 'pujasera_admin',
        status: 'active',
        storeId: primaryStoreIdForAdmin,
        pujaseraGroupSlug,
    });
    
    await batch.commit();

    // Send notifications directly
    const { deviceId, adminGroup } = getWhatsappSettings();
    if (deviceId) {
        const welcomeMessage = `🎉 *Selamat Datang di Chika POS, ${adminName}!* 🎉\n\nGrup Pujasera Anda *"${pujaseraName}"* telah berhasil dibuat dengan bonus *${bonusTokens} Pradana Token*.\n\nSilakan login untuk mulai mengelola pujasera Anda.`;
        const adminNotifMessage = `*PENDAFTARAN PUJASERA BARU*\n\n*Pujasera:* ${pujaseraName}\n*Lokasi:* ${pujaseraLocation}\n*Admin:* ${adminName}\n*Email:* ${email}\n*WhatsApp:* ${whatsapp}\n\nBonus ${bonusTokens} token telah diberikan.`;
        
        const formattedUserPhone = formatWhatsappNumber(whatsapp);
        await internalSendWhatsapp(deviceId, formattedUserPhone, welcomeMessage);
        
        if (adminGroup) {
            await internalSendWhatsapp(deviceId, adminGroup, adminNotifMessage, true);
        }
    }


    return NextResponse.json({ success: true, message: 'Pendaftaran berhasil!' });

  } catch (error: any) {
    console.error('Error in direct registration API:', error);
    if (newUser) {
      // Clean up orphaned user if DB operations fail
      await auth.deleteUser(newUser.uid).catch(delErr => console.error(`Failed to clean up orphaned user ${newUser?.uid}`, delErr));
    }
    return NextResponse.json({ error: error.message || 'Gagal mendaftarkan pujasera.' }, { status: 500 });
  }
}
