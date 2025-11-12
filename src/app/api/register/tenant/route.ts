
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
import { getTransactionFeeSettings } from '@/lib/server/app-settings';
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
    return NextResponse.json({ error: 'Missing required registration data.' }, { status: 400 });
  }

  let newUser = null;

  try {
    // Fetch pujasera details
    const pujaseraQuery = db.collection('stores').where('pujaseraGroupSlug', '==', pujaseraGroupSlug).limit(1);
    const pujaseraSnapshot = await pujaseraQuery.get();
    if (pujaseraSnapshot.empty) {
        throw new Error('Grup pujasera tidak ditemukan.');
    }
    const pujaseraData = pujaseraSnapshot.docs[0].data();
    
    const feeSettings = await getTransactionFeeSettings();
    const bonusTokens = feeSettings.newTenantBonusTokens || 0; // Use newTenantBonusTokens

    const userRecord = await auth.createUser({ email, password, displayName: adminName });
    newUser = userRecord;
    const uid = newUser.uid;
    
    // Tenants always have the 'admin' role for their own store
    await auth.setCustomUserClaims(uid, { role: 'admin' });

    const batch = db.batch();
    
    // Create the new tenant's store document
    const newStoreRef = db.collection('stores').doc();
    batch.set(newStoreRef, {
      name: storeName,
      location: pujaseraData.location || '',
      pradanaTokenBalance: bonusTokens,
      adminUids: [uid], // The new user is the admin of this tenant
      createdAt: new Date().toISOString(),
      transactionCounter: 0,
      firstTransactionDate: null,
      pujaseraGroupSlug: pujaseraGroupSlug,
      pujaseraName: pujaseraData.name || '',
      isPosEnabled: true, // Tenants are enabled by default
    });

    // Create the user document for the tenant admin
    const userRef = db.collection('users').doc(uid);
    batch.set(userRef, {
      name: adminName,
      email: email,
      whatsapp: whatsapp,
      role: 'admin',
      status: 'active',
      storeId: newStoreRef.id, // Link user to their new store
    });

    await batch.commit();
    console.info(`New tenant '${storeName}' and admin '${email}' created successfully.`);

    // --- Send notifications (non-blocking) ---
    (async () => {
        try {
            const { deviceId, adminGroup } = getWhatsappSettings();
            
            // Notify Tenant
            const welcomeMessage = `🎉 *Selamat Datang di Chika POS, ${adminName}!* 🎉\n\nToko Anda *"${storeName}"* telah berhasil terdaftar di pujasera *${pujaseraData.name}* dengan bonus *${bonusTokens} Pradana Token*.\n\nSilakan login untuk mulai mengelola toko Anda.`;
            const formattedPhone = formatWhatsappNumber(whatsapp);
            if (deviceId && formattedPhone) {
                internalSendWhatsapp(deviceId, formattedPhone, welcomeMessage);
            }

            // Notify Pujasera Admin
            if (deviceId && adminGroup) {
                const adminMessage = `*TENANT BARU BERGABUNG*\n\n*Pujasera:* ${pujaseraData.name}\n*Tenant Baru:* ${storeName}\n*Admin Tenant:* ${adminName}\n*Email:* ${email}\n\nBonus ${bonusTokens} token telah diberikan.`;
                internalSendWhatsapp(deviceId, adminGroup, adminMessage, true);
            }
        } catch (whatsappError) {
            console.error("Error sending tenant registration WhatsApp notifications:", whatsappError);
        }
    })();
    
    return NextResponse.json({ success: true, storeId: newStoreRef.id });

  } catch (error: any) {
    if (newUser) {
      await auth.deleteUser(newUser.uid).catch(delErr => console.error(`Failed to clean up orphaned user ${newUser?.uid}`, delErr));
    }
    console.error('Error in registerNewTenant function:', error);
    
    let errorMessage = 'An unknown error occurred during registration.';
    if (error.code === 'auth/email-already-exists') {
        errorMessage = 'Email ini sudah terdaftar. Silakan gunakan email lain.';
    } else {
        errorMessage = error.message || errorMessage;
    }
    
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
