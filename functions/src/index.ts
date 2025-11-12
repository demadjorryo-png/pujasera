
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";
import { subDays } from "date-fns";
import { format } from "date-fns/format";
import { id as idLocale } from "date-fns/locale";

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

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

export const processWhatsappQueue = onDocumentCreated("whatsappQueue/{messageId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        logger.info("No data associated with the event, exiting.");
        return;
    }

    const messageData = snapshot.data();
    const { to, message, isGroup = false } = messageData;

    if (!to || !message) {
        logger.error("Document is missing 'to' or 'message' field.", { id: snapshot.id });
        return snapshot.ref.update({ status: 'failed', error: 'Missing to/message field' });
    }

    try {
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
        return snapshot.ref.update({ status: 'sent', sentAt: FieldValue.serverTimestamp() });

    } catch (error: any) {
        logger.error(`Failed to process WhatsApp message for recipient '${to}':`, error);
        return snapshot.ref.update({ status: 'failed', error: error.message, processedAt: FieldValue.serverTimestamp() });
    }
});

/**
 * Triggers when a new Pujasera transaction is created.
 * This function handles the distribution of orders to individual tenants.
 */
export const onPujaseraTransactionCreate = onDocumentCreated("stores/{pujaseraId}/transactions/{transactionId}", async (event) => {
    const transactionSnapshot = event.data;
    if (!transactionSnapshot) {
        logger.info("No data for onPujaseraTransactionCreate event, exiting.");
        return;
    }

    const transactionData = transactionSnapshot.data();
    const pujaseraId = event.params.pujaseraId;

    // Only proceed if this transaction is for a pujasera group and is marked 'Diproses'
    if (!transactionData.pujaseraGroupSlug || transactionData.status !== 'Diproses') {
        return;
    }

    logger.info(`Processing pujasera transaction ${transactionSnapshot.id} for distribution.`);

    const batch = db.batch();

    try {
        // Group items by their original tenant storeId
        const itemsByTenant: { [key: string]: any[] } = {};
        for (const item of transactionData.items) {
            if (!item.storeId) continue;
            if (!itemsByTenant[item.storeId]) {
                itemsByTenant[item.storeId] = [];
            }
            itemsByTenant[item.storeId].push(item);
        }

        // Create a sub-transaction for each tenant
        for (const tenantId in itemsByTenant) {
            const tenantItems = itemsByTenant[tenantId];
            const tenantSubtotal = tenantItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

            const tenantTransactionData = {
                receiptNumber: transactionData.receiptNumber, // Use the SAME receipt number
                storeId: tenantId,
                customerId: transactionData.customerId,
                customerName: transactionData.customerName,
                staffId: transactionData.staffId, // The pujasera cashier who processed
                createdAt: transactionData.createdAt,
                items: tenantItems,
                subtotal: tenantSubtotal,
                taxAmount: 0, // Tax is handled at the central level
                serviceFeeAmount: 0, // Service fee is handled at the central level
                discountAmount: 0, // Discount is handled at the central level
                totalAmount: tenantSubtotal, // Total for this tenant's items only
                paymentMethod: 'Lunas (Pusat)',
                status: 'Diproses', // This will appear in the tenant's kitchen view
                pointsEarned: 0, // Points are handled at the central level
                pointsRedeemed: 0, // Points are handled at the central level
                notes: `Bagian dari pesanan pujasera #${String(transactionData.receiptNumber).padStart(6, '0')}`
            };

            const newTenantTransactionRef = db.collection('stores').doc(tenantId).collection('transactions').doc();
            batch.set(newTenantTransactionRef, tenantTransactionData);
            
            // NOTE: We no longer increment the tenant's personal transaction counter
            // as the receipt number is now centralized.
        }
        
        // Update customer points if applicable
        if (transactionData.customerId !== 'N/A' && (transactionData.pointsEarned > 0 || transactionData.pointsRedeemed > 0)) {
            const customerRef = db.collection('stores').doc(pujaseraId).collection('customers').doc(transactionData.customerId);
            const pointsChange = (transactionData.pointsEarned || 0) - (transactionData.pointsRedeemed || 0);
            batch.update(customerRef, { loyaltyPoints: FieldValue.increment(pointsChange) });
        }
        
        // Update pujasera transaction counter and token balance
        const settingsDoc = await db.doc('appSettings/transactionFees').get();
        const feeSettings = settingsDoc.data() || {};
        const feePercentage = feeSettings.feePercentage ?? 0.005;
        const minFeeRp = feeSettings.minFeeRp ?? 500;
        const maxFeeRp = feeSettings.maxFeeRp ?? 2500;
        const tokenValueRp = feeSettings.tokenValueRp ?? 1000;
        
        const feeFromPercentage = transactionData.totalAmount * feePercentage;
        const feeCappedAtMin = Math.max(feeFromPercentage, minFeeRp);
        const feeCappedAtMax = Math.min(feeCappedAtMin, maxFeeRp);
        const transactionFee = feeCappedAtMax / tokenValueRp;
        
        batch.update(db.doc(`stores/${pujaseraId}`), { 
            transactionCounter: FieldValue.increment(1),
            pradanaTokenBalance: FieldValue.increment(-transactionFee)
        });

        // Finally, clear the virtual table if it was a catalog order
        if (transactionData.tableId) {
            const tableRef = db.doc(`stores/${pujaseraId}/tables/${transactionData.tableId}`);
            const tableDoc = await tableRef.get();
            if (tableDoc.exists && tableDoc.data()?.isVirtual) {
                batch.delete(tableRef);
            } else if (tableDoc.exists) {
                // For physical tables, don't clear it yet, wait for 'Selesaikan'
            }
        }

        await batch.commit();
        logger.info(`Successfully distributed transaction ${transactionSnapshot.id} to ${Object.keys(itemsByTenant).length} tenants.`);

    } catch (error) {
        logger.error(`Error processing pujasera transaction ${transactionSnapshot.id}:`, error);
        // Optionally, update the transaction status to 'failed_distribution'
    }
});

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
    
    const whatsappQueueRef = db.collection('whatsappQueue');

    try {
        // Path to the subcollection in the store document for history
        const historyRef = db.collection('stores').doc(storeId).collection('topUpRequests').doc(snapshot.id);
        
        // 1. Sync the data to the store's subcollection
        await historyRef.set(requestData);
        logger.info(`Synced top-up request ${snapshot.id} to store ${storeId}`);

        // 2. Send notification to the appropriate admin group
        const formattedAmount = (tokensToAdd || 0).toLocaleString('id-ID');
        const adminMessage = `🔔 *Permintaan Top-up Baru*\n\nToko: *${storeName}*\nPengaju: *${userName || 'N/A'}*\nJumlah: *${formattedAmount} token*\n\nMohon segera verifikasi di panel admin.\nBukti: ${proofUrl || 'Tidak ada'}`;
        
        await whatsappQueueRef.add({
            to: 'admin_group', // This will be resolved to the env var group by processWhatsappQueue
            message: adminMessage,
            isGroup: true,
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

  // Proceed only if the status has changed from pending to something else.
  if (before.status !== 'pending' || before.status === after.status) {
    return;
  }
  
  const { storeId, storeName, status, tokensToAdd, userId } = after;
  const requestId = event.params.requestId;

  if (!storeId || !storeName) {
    logger.error(`Request ${requestId} is missing 'storeId' or 'storeName'. Cannot process update.`);
    return;
  }

  const whatsappQueueRef = db.collection('whatsappQueue');
  const formattedAmount = (tokensToAdd || 0).toLocaleString('id-ID');
  
  // Get customer's WhatsApp number and name from their user profile
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
      // Do nothing for other status changes
      return;
  }

  try {
      // Queue notification for customer
      if (customerWhatsapp) {
          const formattedPhone = customerWhatsapp.startsWith('0') ? `62${customerWhatsapp.substring(1)}` : customerWhatsapp;
          await whatsappQueueRef.add({
              to: formattedPhone,
              message: customerMessage,
              isGroup: false,
              createdAt: FieldValue.serverTimestamp(),
          });
          logger.info(`Queued '${status}' notification for customer ${customerName} of store ${storeId}`);
      } else {
          logger.warn(`User ${userId} for store ${storeId} does not have a WhatsApp number. Cannot send notification.`);
      }
      
      // Queue notification for admin group
      await whatsappQueueRef.add({
          to: 'admin_group',
          message: adminMessage,
          isGroup: true,
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

            // Calculate date range for yesterday
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

            // Fetch admin details
            const adminDocs = await Promise.all(
                store.adminUids.map((uid: string) => db.collection('users').doc(uid).get())
            );

            const formattedDate = format(yesterday, "EEEE, d MMMM yyyy", { locale: idLocale });

            for (const adminDoc of adminDocs) {
                if (adminDoc.exists) {
                    const adminData = adminDoc.data();
                    if (adminData && adminData.whatsapp) {
                        const message = `*Ringkasan Harian Chika POS*\n*${store.name}* - ${formattedDate}\n\nHalo *${adminData.name}*, berikut adalah ringkasan penjualan Anda kemarin:\n- *Total Omset*: Rp ${totalRevenue.toLocaleString('id-ID')}\n- *Jumlah Transaksi*: ${totalTransactions}\n\nTerus pantau dan optimalkan performa penjualan Anda melalui dasbor Chika. Semangat selalu! 💪\n\n_Apabila tidak berkenan, fitur ini dapat dinonaktifkan di menu Pengaturan._`;

                        await db.collection('whatsappQueue').add({
                            to: adminData.whatsapp,
                            message: message,
                            isGroup: false,
                            storeId: storeId,
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
