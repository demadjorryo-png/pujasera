
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

  let newUser = null;

  try {
    const feeSettings = await getTransactionFeeSettings();
    const bonusTokens = feeSettings.newStoreBonusTokens || 0; // Use newStoreBonusTokens

    const userRecord = await auth.createUser({ email, password, displayName: adminName });
    newUser = userRecord;
    const uid = newUser.uid;

    const pujaseraGroupSlug = pujaseraName
        .toLowerCase()
        .replace(/\s+/g, '-')       // Replace spaces with -
        .replace(/[^\w\-]+/g, '')    // Remove all non-word chars
        .replace(/\-\-+/g, '-')      // Replace multiple - with single -
        .replace(/^-+/, '')          // Trim - from start of text
        .replace(/-+$/, '') + '-' + Math.random().toString(36).substring(2, 7);
    
    // For a pujasera admin, their primary "storeId" is their own UID,
    // as they are the main entity for the pujasera group.
    const primaryStoreIdForAdmin = uid;

    await auth.setCustomUserClaims(uid, { role: 'pujasera_admin', pujaseraGroupSlug: pujaseraGroupSlug });

    const batch = db.batch();
    
    // The "store" for a pujasera admin represents the pujasera itself.
    const storeRef = db.collection('stores').doc(primaryStoreIdForAdmin);
    
    batch.set(storeRef, {
      name: pujaseraName, // Store name is the pujasera name
      location: pujaseraLocation,
      pradanaTokenBalance: bonusTokens,
      adminUids: [uid], // The pujasera admin is the admin of this "store"
      createdAt: new Date().toISOString(),
      transactionCounter: 0,
      firstTransactionDate: null,
      referralCode: referralCode || '',
      pujaseraName,
      pujaseraLocation,
      pujaseraGroupSlug,
      catalogSlug: pujaseraGroupSlug,
      // Defaulting POS to be enabled, can be changed later
      isPosEnabled: true,
    });

    const userRef = db.collection('users').doc(uid);
    batch.set(userRef, {
      name: adminName,
      email: email,
      whatsapp: whatsapp,
      role: 'pujasera_admin', // Set the correct role
      status: 'active',
      storeId: primaryStoreIdForAdmin,
      pujaseraGroupSlug: pujaseraGroupSlug,
    });

    await batch.commit();
    console.info(`New pujasera group and admin created successfully for ${email}`);

    (async () => {
        try {
            const { deviceId, adminGroup } = getWhatsappSettings();
            const welcomeMessage = `🎉 *Selamat Datang di Chika POS, ${adminName}!* 🎉\n\nGrup Pujasera Anda *"${pujaseraName}"* telah berhasil dibuat dengan bonus *${bonusTokens} Pradana Token*.\n\nSilakan login untuk mulai mengelola pujasera Anda.`;
            const formattedPhone = formatWhatsappNumber(whatsapp);
            
            if (deviceId && formattedPhone) {
                internalSendWhatsapp(deviceId, formattedPhone, welcomeMessage);
            }

            if (deviceId && adminGroup) {
                const adminMessage = `*PENDAFTARAN PUJASERA BARU*\n\n*Pujasera:* ${pujaseraName}\n*Lokasi:* ${pujaseraLocation}\n*Admin:* ${adminName}\n*Email:* ${email}\n*WhatsApp:* ${whatsapp}\n\nBonus ${bonusTokens} token telah diberikan.`;
                internalSendWhatsapp(deviceId, adminGroup, adminMessage, true);
            }
        } catch (whatsappError) {
            console.error("Error sending registration WhatsApp notifications:", whatsappError);
        }
    })();
    
    return NextResponse.json({ success: true, storeId: primaryStoreIdForAdmin });

  } catch (error: any) {
    if (newUser) {
      await auth.deleteUser(newUser.uid).catch(delErr => console.error(`Failed to clean up orphaned user ${newUser?.uid}`, delErr));
    }
    console.error('Error in registerNewStore function:', error);
    
    let errorMessage = 'An unknown error occurred during registration.';
    if (error.code === 'auth/email-already-exists') {
        errorMessage = 'Email ini sudah terdaftar. Silakan gunakan email lain.';
    } else {
        errorMessage = error.message || errorMessage;
    }
    
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
