
'use server';
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth, UserRecord } from "firebase-admin/auth";
import { subDays } from "date-fns";
import { format } from "date-fns/format";
import { id as idLocale } from "date-fns/locale";
import type { CartItem, Transaction } from "./types";

// Initialize Firebase Admin SDK if not already initialized
if (getApps().length === 0) {
    initializeApp();
}
const db = getFirestore();
const adminAuth = getAuth();


interface WhatsappSettings {
  deviceId?: string;
  adminGroup?: string;
}

/**
 * Retrieves WhatsApp settings directly from environment variables.
 */
function getWhatsappSettings(): WhatsappSettings {
  const deviceId = process.env.WHATSAPP_DEVICE_ID;
  const adminGroup = process.env.WHATSAPP_ADMIN_GROUP;

  if (!deviceId) {
    logger.warn("WHATSAPP_DEVICE_ID environment variable is not set.");
  }
  if (!adminGroup) {
    logger.warn("WHATSAPP_ADMIN_GROUP environment variable is not set.");
  }

  return { deviceId, adminGroup };
}

/**
 * Main function to handle all queued tasks.
 * It now orchestrates order processing, distribution, and WhatsApp notifications.
 */
export const processPujaseraQueue = onDocumentCreated("Pujaseraqueue/{jobId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        logger.info("No data associated with the event, exiting.");
        return;
    }

    const jobData = snapshot.data();
    const { type, payload } = jobData;

    try {
        await snapshot.ref.update({ status: 'processing', startedAt: FieldValue.serverTimestamp() });
        switch (type) {
            case 'pujasera-order':
                await handlePujaseraOrder(payload);
                await snapshot.ref.update({ status: 'completed', processedAt: FieldValue.serverTimestamp() });
                break;
            case 'whatsapp-notification':
                await handleWhatsappNotification(payload);
                await snapshot.ref.update({ status: 'sent', processedAt: FieldValue.serverTimestamp() });
                break;
            default:
                logger.warn(`Unknown job type: ${type}`);
                await snapshot.ref.update({ status: 'unknown_type', error: `Unknown job type: ${type}`, processedAt: FieldValue.serverTimestamp() });
        }
    } catch (error: any) {
        logger.error(`Failed to process job ${snapshot.id} of type ${type}:`, error);
        await snapshot.ref.update({ status: 'failed', error: error.message, processedAt: FieldValue.serverTimestamp() });
    }
});


async function handlePujaseraOrder(payload: any) {
    const { pujaseraId, customer, cart, subtotal, taxAmount, serviceFeeAmount, totalAmount, paymentMethod, staffId, pointsEarned, pointsToRedeem, tableId, isFromCatalog } = payload;
    
    if (!pujaseraId || !customer || !cart || cart.length === 0) {
        throw new Error("Data pesanan tidak lengkap.");
    }
    
    const batch = db.batch();
    
    const pujaseraStoreRef = db.doc(`stores/${pujaseraId}`);
    const pujaseraStoreDoc = await pujaseraStoreRef.get();
    if (!pujaseraStoreDoc.exists) throw new Error("Pujasera tidak ditemukan.");
    
    const pujaseraData = pujaseraStoreDoc.data()!;
    const pujaseraCounter = pujaseraData.transactionCounter || 0;
    const newReceiptNumber = pujaseraCounter + 1;
    
    // Group items by tenant for distribution
    const itemsByTenant: { [key: string]: { storeName: string, items: CartItem[] } } = {};
    for (const item of cart) {
        if (!item.storeId || !item.storeName) continue;
        if (!itemsByTenant[item.storeId]) {
            itemsByTenant[item.storeId] = { storeName: item.storeName, items: [] };
        }
        itemsByTenant[item.storeId].items.push(item);
    }
    
    // Main Transaction
    const newTxRef = db.collection('stores').doc(pujaseraId).collection('transactions').doc();
    const newTransactionData: Partial<Transaction> = {
        receiptNumber: newReceiptNumber,
        storeId: pujaseraId,
        customerId: customer.id || 'N/A',
        customerName: customer.name || 'Guest',
        staffId: staffId || 'catalog-system',
        createdAt: new Date().toISOString(),
        items: cart,
        subtotal, taxAmount, serviceFeeAmount, discountAmount: 0,
        totalAmount,
        paymentMethod,
        status: 'Diproses',
        pointsEarned: pointsEarned || 0,
        pointsRedeemed: pointsToRedeem || 0,
        tableId: tableId || undefined,
        pujaseraGroupSlug: pujaseraData.pujaseraGroupSlug,
        notes: isFromCatalog ? 'Pesanan dari Katalog Publik' : '',
        itemsStatus: {} // Initialize status tracking
    };
    
    newTransactionData.itemsStatus = Object.keys(itemsByTenant).reduce((acc, tenantId) => ({ ...acc, [tenantId]: 'Diproses' }), {});
    batch.set(newTxRef, newTransactionData);

    // Create sub-transactions for each tenant
    for (const tenantId in itemsByTenant) {
        const tenantInfo = itemsByTenant[tenantId];
        const tenantItems = tenantInfo.items;
        const tenantSubtotal = tenantItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

        // Use a predictable ID for the sub-transaction
        const subTransactionId = `${newTxRef.id}_${tenantId}`;
        const newTenantTransactionRef = db.collection('stores').doc(tenantId).collection('transactions').doc(subTransactionId);
        
        batch.set(newTenantTransactionRef, {
            receiptNumber: newReceiptNumber,
            storeId: tenantId,
            customerId: customer.id,
            customerName: customer.name,
            createdAt: newTransactionData.createdAt,
            items: tenantItems,
            subtotal: tenantSubtotal,
            totalAmount: tenantSubtotal,
            status: 'Diproses',
            notes: `Bagian dari pesanan pujasera #${String(newReceiptNumber).padStart(6, '0')}`,
            parentTransactionId: newTxRef.id,
            pujaseraId: pujaseraId,
        });
    }

    // Handle table updates if it's a catalog order to be paid at cashier
    if (isFromCatalog && paymentMethod === 'kasir' && tableId) {
        const tableRef = db.doc(`stores/${pujaseraId}/tables/${tableId}`);
        batch.update(tableRef, {
            'currentOrder.transactionId': newTxRef.id
        });
    } else if (tableId && paymentMethod !== 'Belum Dibayar') { // For POS orders
         const tableRef = db.doc(`stores/${pujaseraId}/tables/${tableId}`);
         batch.update(tableRef, {
            status: 'Terisi',
            currentOrder: {
                items: cart,
                totalAmount: totalAmount,
                orderTime: newTransactionData.createdAt,
                transactionId: newTxRef.id
            }
        });
    }

    // Handle token deduction
    const settingsDoc = await db.doc('appSettings/transactionFees').get();
    const feeSettings = settingsDoc.data() || {};
    const feePercentage = feeSettings.feePercentage ?? 0.005;
    const minFeeRp = feeSettings.minFeeRp ?? 500;
    const maxFeeRp = feeSettings.maxFeeRp ?? 2500;
    const tokenValueRp = feeSettings.tokenValueRp ?? 1000;
    const feeFromPercentage = totalAmount * feePercentage;
    const feeCappedAtMin = Math.max(feeFromPercentage, minFeeRp);
    const feeCappedAtMax = Math.min(feeCappedAtMin, maxFeeRp);
    const transactionFee = feeCappedAtMax / tokenValueRp;
    batch.update(pujaseraStoreRef, { 
        transactionCounter: FieldValue.increment(1),
        pradanaTokenBalance: FieldValue.increment(-transactionFee)
    });

    await batch.commit();
}


async function handleWhatsappNotification(payload: any) {
    const { to, message, isGroup = false } = payload;

    if (!to || !message) {
        throw new Error("Payload is missing 'to' or 'message' field.");
    }

    const { deviceId, adminGroup } = getWhatsappSettings();
    if (!deviceId) {
        throw new Error("WhatsApp deviceId is not configured in environment variables.");
    }

    const recipient = (to === 'admin_group' && isGroup) ? adminGroup : to;
    if (!recipient) {
        throw new Error(`Recipient is invalid. 'to' field was '${to}' and adminGroup is not set.`);
    }

    const fetch = (await import('node-fetch')).default;
    const body = new URLSearchParams();
    body.append('device_id', deviceId);
    body.append(isGroup ? 'group' : 'number', recipient);
    body.append('message', message);

    const endpoint = isGroup ? 'sendGroup' : 'send';
    const webhookUrl = `https://app.whacenter.com/api/${endpoint}`;

    const response = await fetch(webhookUrl, {
        method: 'POST',
        body: body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    const responseJson = await response.json() as { status: 'error' | 'success', reason?: string };

    if (!response.ok || responseJson.status === 'error') {
        throw new Error(responseJson.reason || `WhaCenter API error with status ${response.status}`);
    }

    logger.info(`Successfully sent WhatsApp message via queue to ${recipient}`);
}

/**
 * Triggers when a new top-up request is created.
 * It syncs the request to the store's subcollection and sends a notification to the admin group.
 */
export const onTopUpRequestCreate = onDocumentCreated("topUpRequests/{requestId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        logger.info("No data for onTopUpRequestCreate event, exiting.");
        return;
    }

    const requestData = snapshot.data();
    const { storeId, storeName, tokensToAdd, proofUrl, userName } = requestData;

    if (!storeId || !storeName) {
        logger.error("Top-up request is missing 'storeId' or 'storeName'.", { id: snapshot.id });
        return;
    }
    
    const whatsappQueueRef = db.collection('Pujaseraqueue');

    try {
        const historyRef = db.collection('stores').doc(storeId).collection('topUpRequests').doc(snapshot.id);
        await historyRef.set(requestData);
        logger.info(`Synced top-up request ${snapshot.id} to store ${storeId}`);

        const formattedAmount = (tokensToAdd || 0).toLocaleString('id-ID');
        const adminMessage = `🔔 *Permintaan Top-up Baru*\n\nToko: *${storeName}*\nPengaju: *${userName || 'N/A'}*\nJumlah: *${formattedAmount} token*\n\nMohon segera verifikasi di panel admin.\nBukti: ${proofUrl || 'Tidak ada'}`;
        
        await whatsappQueueRef.add({
            type: 'whatsapp-notification',
            payload: {
                to: 'admin_group',
                message: adminMessage,
                isGroup: true,
            },
            createdAt: FieldValue.serverTimestamp(),
        });
        logger.info(`Queued new top-up request notification for platform admin.`);

    } catch (error) {
        logger.error(`Failed to process new top-up request ${snapshot.id} for store ${storeId}:`, error);
    }
});


/**
 * Handles logic when a top-up request is updated (approved/rejected).
 * Sends notifications to the customer and admin group via whatsappQueue.
 */
export const onTopUpRequestUpdate = onDocumentUpdated("topUpRequests/{requestId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) {
    logger.info("No data change detected in onTopUpRequestUpdate, exiting.");
    return;
  }

  if (before.status !== 'pending' || before.status === after.status) {
    return;
  }
  
  const { storeId, storeName, status, tokensToAdd, userId } = after;
  const requestId = event.params.requestId;

  if (!storeId || !storeName) {
    logger.error(`Request ${requestId} is missing 'storeId' or 'storeName'. Cannot process update.`);
    return;
  }

  const whatsappQueueRef = db.collection('Pujaseraqueue');
  const formattedAmount = (tokensToAdd || 0).toLocaleString('id-ID');
  
  let customerWhatsapp = '';
  let customerName = after.userName || 'Pelanggan';

  if (userId) {
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            customerWhatsapp = userDoc.data()?.whatsapp || '';
            customerName = userDoc.data()?.name || customerName;
        }
      } catch (userError) {
          logger.error(`Could not fetch user document for UID ${userId}:`, userError);
      }
  }

  let customerMessage = '';
  let adminMessage = '';

  if (status === 'completed') {
      customerMessage = `✅ *Top-up Disetujui!*\n\nHalo ${customerName},\nPermintaan top-up Anda untuk toko *${storeName}* telah disetujui.\n\nSejumlah *${formattedAmount} token* telah ditambahkan ke saldo Anda.\n\nTerima kasih!`;
      adminMessage = `✅ *Top-up Disetujui*\n\nPermintaan dari: *${storeName}*\nJumlah: *${formattedAmount} token*\n\nStatus berhasil diperbarui dan saldo toko telah ditambahkan.`;
  } else if (status === 'rejected') {
      customerMessage = `❌ *Top-up Ditolak*\n\nHalo ${customerName},\nMohon maaf, permintaan top-up Anda untuk toko *${storeName}* sejumlah ${formattedAmount} token telah ditolak.\n\nSilakan periksa bukti transfer Anda dan coba lagi, atau hubungi admin jika ada pertanyaan.`;
      adminMessage = `❌ *Top-up Ditolak*\n\nPermintaan dari: *${storeName}*\nJumlah: *${formattedAmount} token*\n\nStatus berhasil diperbarui. Tidak ada perubahan pada saldo toko.`;
  } else {
      return;
  }

  try {
      if (customerWhatsapp) {
          const formattedPhone = customerWhatsapp.startsWith('0') ? `62${customerWhatsapp.substring(1)}` : customerWhatsapp;
          await whatsappQueueRef.add({
              type: 'whatsapp-notification',
              payload: {
                  to: formattedPhone,
                  message: customerMessage,
                  isGroup: false,
              },
              createdAt: FieldValue.serverTimestamp(),
          });
          logger.info(`Queued '${status}' notification for customer ${customerName} of store ${storeId}`);
      } else {
          logger.warn(`User ${userId} for store ${storeId} does not have a WhatsApp number. Cannot send notification.`);
      }
      
      await whatsappQueueRef.add({
          type: 'whatsapp-notification',
          payload: {
              to: 'admin_group',
              message: adminMessage,
              isGroup: true,
          },
          createdAt: FieldValue.serverTimestamp(),
      });
      logger.info(`Queued '${status}' notification for admin group for request from ${storeName}.`);

  } catch (error) {
      logger.error(`Failed to queue notifications for request ${requestId}:`, error);
  }
});


export const sendDailySalesSummary = onSchedule({
    schedule: "1 0 * * *", // Runs at 00:01 every day
    timeZone: "Asia/Jakarta",
}, async (event) => {
    logger.info("Memulai pengiriman ringkasan penjualan harian...");
    try {
        const storesSnapshot = await db.collection('stores').get();
        if (storesSnapshot.empty) {
            logger.info("Tidak ada toko yang terdaftar. Proses dihentikan.");
            return;
        }

        const promises = storesSnapshot.docs.map(async (storeDoc) => {
            const store = storeDoc.data();
            const storeId = storeDoc.id;

            if (store.notificationSettings?.dailySummaryEnabled === false) {
                logger.info(`Pengiriman ringkasan harian dinonaktifkan untuk toko: ${store.name}`);
                return;
            }
            
            if (!store.adminUids || store.adminUids.length === 0) {
                logger.warn(`Toko ${store.name} tidak memiliki admin.`);
                return;
            }

            const today = new Date();
            const yesterday = subDays(today, 1);
            const startOfDayTs = Timestamp.fromDate(new Date(yesterday.setHours(0, 0, 0, 0)));
            const endOfDayTs = Timestamp.fromDate(new Date(yesterday.setHours(23, 59, 59, 999)));

            const transactionsSnapshot = await db.collectionGroup('transactions')
                .where('storeId', '==', storeId)
                .where('createdAt', '>=', startOfDayTs.toDate().toISOString())
                .where('createdAt', '<=', endOfDayTs.toDate().toISOString())
                .get();

            let totalRevenue = 0;
            const totalTransactions = transactionsSnapshot.size;
            transactionsSnapshot.forEach(txDoc => {
                totalRevenue += txDoc.data().totalAmount || 0;
            });

            logger.info(`Toko: ${store.name}, Omset Kemarin: Rp ${totalRevenue}, Transaksi: ${totalTransactions}`);

            const adminDocs = await Promise.all(
                store.adminUids.map((uid: string) => db.collection('users').doc(uid).get())
            );

            const formattedDate = format(yesterday, "EEEE, d MMMM yyyy", { locale: idLocale });

            for (const adminDoc of adminDocs) {
                if (adminDoc.exists) {
                    const adminData = adminDoc.data();
                    if (adminData && adminData.whatsapp) {
                        const message = `*Ringkasan Harian Chika POS*\n*${store.name}* - ${formattedDate}\n\nHalo *${adminData.name}*, berikut adalah ringkasan penjualan Anda kemarin:\n- *Total Omset*: Rp ${totalRevenue.toLocaleString('id-ID')}\n- *Jumlah Transaksi*: ${totalTransactions}\n\nTerus pantau dan optimalkan performa penjualan Anda melalui dasbor Chika. Semangat selalu! 💪\n\n_Apabila tidak berkenan, fitur ini dapat dinonaktifkan di menu Pengaturan._`;

                        await db.collection('Pujaseraqueue').add({
                            type: 'whatsapp-notification',
                            payload: {
                                to: adminData.whatsapp,
                                message: message,
                                isGroup: false,
                                storeId: storeId,
                            },
                            createdAt: FieldValue.serverTimestamp(),
                        });
                        logger.info(`Laporan harian berhasil diantrikan untuk ${adminData.name} (${store.name})`);
                    }
                }
            }
        });
        await Promise.all(promises);
        logger.info("Pengiriman ringkasan penjualan harian selesai.");
    } catch (error) {
        logger.error("Error dalam fungsi terjadwal sendDailySalesSummary:", error);
    }
});
