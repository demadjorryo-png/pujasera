"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDailySalesSummary = exports.onTopUpRequestUpdate = exports.onTopUpRequestCreate = exports.onPujaseraTransactionCreate = exports.processWhatsappQueue = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const firestore_2 = require("firebase-admin/firestore");
const app_1 = require("firebase-admin/app");
const date_fns_1 = require("date-fns");
const format_1 = require("date-fns/format");
const locale_1 = require("date-fns/locale");
// Initialize Firebase Admin SDK
(0, app_1.initializeApp)();
const db = (0, firestore_2.getFirestore)();
/**
 * Retrieves WhatsApp settings directly from environment variables.
 */
function getWhatsappSettings() {
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
exports.processWhatsappQueue = (0, firestore_1.onDocumentCreated)("whatsappQueue/{messageId}", async (event) => {
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
        const fetch = (await Promise.resolve().then(() => require('node-fetch'))).default;
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
        const responseJson = await response.json();
        if (!response.ok || responseJson.status === 'error') {
            throw new Error(responseJson.reason || `WhaCenter API error with status ${response.status}`);
        }
        logger.info(`Successfully sent WhatsApp message via queue to ${recipient}`);
        return snapshot.ref.update({ status: 'sent', sentAt: firestore_2.FieldValue.serverTimestamp() });
    }
    catch (error) {
        logger.error(`Failed to process WhatsApp message for recipient '${to}':`, error);
        return snapshot.ref.update({ status: 'failed', error: error.message, processedAt: firestore_2.FieldValue.serverTimestamp() });
    }
});
/**
 * Triggers when a new Pujasera transaction is created.
 * This function handles the distribution of orders to individual tenants.
 */
exports.onPujaseraTransactionCreate = (0, firestore_1.onDocumentCreated)("stores/{pujaseraId}/transactions/{transactionId}", async (event) => {
    var _a, _b, _c, _d, _e;
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
        const itemsByTenant = {};
        for (const item of transactionData.items) {
            if (!item.storeId)
                continue;
            if (!itemsByTenant[item.storeId]) {
                itemsByTenant[item.storeId] = [];
            }
            itemsByTenant[item.storeId].push(item);
        }
        // Fetch all tenants' data in parallel to get their current transaction counters
        const tenantRefs = Object.keys(itemsByTenant).map(tenantId => db.doc(`stores/${tenantId}`));
        const tenantDocs = await db.getAll(...tenantRefs);
        const tenantDataMap = new Map(tenantDocs.map(doc => [doc.id, doc.data()]));
        // Create a sub-transaction for each tenant
        for (const tenantId in itemsByTenant) {
            const tenantItems = itemsByTenant[tenantId];
            const tenantData = tenantDataMap.get(tenantId);
            if (!tenantData) {
                logger.warn(`Tenant data for ID ${tenantId} not found, skipping distribution for these items.`);
                continue;
            }
            const tenantCounter = tenantData.transactionCounter || 0;
            const newTenantReceiptNumber = tenantCounter + 1;
            const tenantSubtotal = tenantItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const tenantTransactionData = {
                receiptNumber: newTenantReceiptNumber,
                storeId: tenantId,
                customerId: transactionData.customerId,
                customerName: transactionData.customerName,
                staffId: transactionData.staffId, // The pujasera cashier who processed
                createdAt: transactionData.createdAt,
                items: tenantItems,
                subtotal: tenantSubtotal,
                taxAmount: 0,
                serviceFeeAmount: 0,
                discountAmount: 0,
                totalAmount: tenantSubtotal,
                paymentMethod: 'Lunas (Pusat)',
                status: 'Diproses', // This will appear in the tenant's kitchen view
                pointsEarned: 0,
                pointsRedeemed: 0,
                notes: `Bagian dari pesanan pujasera #${String(transactionData.receiptNumber).padStart(6, '0')}`
            };
            const newTenantTransactionRef = db.collection('stores').doc(tenantId).collection('transactions').doc();
            batch.set(newTenantTransactionRef, tenantTransactionData);
            batch.update(db.doc(`stores/${tenantId}`), { transactionCounter: firestore_2.FieldValue.increment(1) });
        }
        // Update customer points if applicable
        if (transactionData.customerId !== 'N/A' && (transactionData.pointsEarned > 0 || transactionData.pointsRedeemed > 0)) {
            const customerRef = db.collection('stores').doc(pujaseraId).collection('customers').doc(transactionData.customerId);
            const pointsChange = transactionData.pointsEarned - transactionData.pointsRedeemed;
            batch.update(customerRef, { loyaltyPoints: firestore_2.FieldValue.increment(pointsChange) });
        }
        // Update pujasera transaction counter and token balance
        const settingsDoc = await db.doc('appSettings/transactionFees').get();
        const feeSettings = settingsDoc.data() || {};
        const feePercentage = (_a = feeSettings.feePercentage) !== null && _a !== void 0 ? _a : 0.005;
        const minFeeRp = (_b = feeSettings.minFeeRp) !== null && _b !== void 0 ? _b : 500;
        const maxFeeRp = (_c = feeSettings.maxFeeRp) !== null && _c !== void 0 ? _c : 2500;
        const tokenValueRp = (_d = feeSettings.tokenValueRp) !== null && _d !== void 0 ? _d : 1000;
        const feeFromPercentage = transactionData.totalAmount * feePercentage;
        const feeCappedAtMin = Math.max(feeFromPercentage, minFeeRp);
        const feeCappedAtMax = Math.min(feeCappedAtMin, maxFeeRp);
        const transactionFee = feeCappedAtMax / tokenValueRp;
        batch.update(db.doc(`stores/${pujaseraId}`), {
            transactionCounter: firestore_2.FieldValue.increment(1),
            pradanaTokenBalance: firestore_2.FieldValue.increment(-transactionFee)
        });
        // Finally, clear the virtual table
        if (transactionData.tableId) {
            const tableRef = db.doc(`stores/${pujaseraId}/tables/${transactionData.tableId}`);
            const tableDoc = await tableRef.get();
            if (tableDoc.exists && ((_e = tableDoc.data()) === null || _e === void 0 ? void 0 : _e.isVirtual)) {
                batch.delete(tableRef);
            }
            else if (tableDoc.exists) {
                batch.update(tableRef, { status: 'Menunggu Dibersihkan', currentOrder: null });
            }
        }
        await batch.commit();
        logger.info(`Successfully distributed transaction ${transactionSnapshot.id} to ${Object.keys(itemsByTenant).length} tenants.`);
    }
    catch (error) {
        logger.error(`Error processing pujasera transaction ${transactionSnapshot.id}:`, error);
        // Optionally, update the transaction status to 'failed_distribution'
    }
});
/**
 * Triggers when a new top-up request is created.
 * It syncs the request to the store's subcollection and sends a notification to the admin group.
 */
exports.onTopUpRequestCreate = (0, firestore_1.onDocumentCreated)("topUpRequests/{requestId}", async (event) => {
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
            createdAt: firestore_2.FieldValue.serverTimestamp(),
        });
        logger.info(`Queued new top-up request notification for platform admin.`);
    }
    catch (error) {
        logger.error(`Failed to process new top-up request ${snapshot.id} for store ${storeId}:`, error);
    }
});
/**
 * Handles logic when a top-up request is updated (approved/rejected).
 * Sends notifications to the customer and admin group via whatsappQueue.
 */
exports.onTopUpRequestUpdate = (0, firestore_1.onDocumentUpdated)("topUpRequests/{requestId}", async (event) => {
    var _a, _b, _c, _d;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
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
                customerWhatsapp = ((_c = userDoc.data()) === null || _c === void 0 ? void 0 : _c.whatsapp) || '';
                customerName = ((_d = userDoc.data()) === null || _d === void 0 ? void 0 : _d.name) || customerName;
            }
        }
        catch (userError) {
            logger.error(`Could not fetch user document for UID ${userId}:`, userError);
        }
    }
    let customerMessage = '';
    let adminMessage = '';
    if (status === 'completed') {
        customerMessage = `✅ *Top-up Disetujui!*\n\nHalo ${customerName},\nPermintaan top-up Anda untuk toko *${storeName}* telah disetujui.\n\nSejumlah *${formattedAmount} token* telah ditambahkan ke saldo Anda.\n\nTerima kasih!`;
        adminMessage = `✅ *Top-up Disetujui*\n\nPermintaan dari: *${storeName}*\nJumlah: *${formattedAmount} token*\n\nStatus berhasil diperbarui dan saldo toko telah ditambahkan.`;
    }
    else if (status === 'rejected') {
        customerMessage = `❌ *Top-up Ditolak*\n\nHalo ${customerName},\nMohon maaf, permintaan top-up Anda untuk toko *${storeName}* sejumlah ${formattedAmount} token telah ditolak.\n\nSilakan periksa bukti transfer Anda dan coba lagi, atau hubungi admin jika ada pertanyaan.`;
        adminMessage = `❌ *Top-up Ditolak*\n\nPermintaan dari: *${storeName}*\nJumlah: *${formattedAmount} token*\n\nStatus berhasil diperbarui. Tidak ada perubahan pada saldo toko.`;
    }
    else {
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
                createdAt: firestore_2.FieldValue.serverTimestamp(),
            });
            logger.info(`Queued '${status}' notification for customer ${customerName} of store ${storeId}`);
        }
        else {
            logger.warn(`User ${userId} for store ${storeId} does not have a WhatsApp number. Cannot send notification.`);
        }
        // Queue notification for admin group
        await whatsappQueueRef.add({
            to: 'admin_group',
            message: adminMessage,
            isGroup: true,
            createdAt: firestore_2.FieldValue.serverTimestamp(),
        });
        logger.info(`Queued '${status}' notification for admin group for request from ${storeName}.`);
    }
    catch (error) {
        logger.error(`Failed to queue notifications for request ${requestId}:`, error);
    }
});
exports.sendDailySalesSummary = (0, scheduler_1.onSchedule)({
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
            var _a;
            const store = storeDoc.data();
            const storeId = storeDoc.id;
            if (((_a = store.notificationSettings) === null || _a === void 0 ? void 0 : _a.dailySummaryEnabled) === false) {
                logger.info(`Pengiriman ringkasan harian dinonaktifkan untuk toko: ${store.name}`);
                return;
            }
            if (!store.adminUids || store.adminUids.length === 0) {
                logger.warn(`Toko ${store.name} tidak memiliki admin.`);
                return;
            }
            // Calculate date range for yesterday
            const today = new Date();
            const yesterday = (0, date_fns_1.subDays)(today, 1);
            const startOfDayTs = firestore_2.Timestamp.fromDate(new Date(yesterday.setHours(0, 0, 0, 0)));
            const endOfDayTs = firestore_2.Timestamp.fromDate(new Date(yesterday.setHours(23, 59, 59, 999)));
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
            const adminDocs = await Promise.all(store.adminUids.map((uid) => db.collection('users').doc(uid).get()));
            const formattedDate = (0, format_1.format)(yesterday, "EEEE, d MMMM yyyy", { locale: locale_1.id });
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
                            createdAt: firestore_2.FieldValue.serverTimestamp(),
                        });
                        logger.info(`Laporan harian berhasil diantrikan untuk ${adminData.name} (${store.name})`);
                    }
                }
            }
        });
        await Promise.all(promises);
        logger.info("Pengiriman ringkasan penjualan harian selesai.");
    }
    catch (error) {
        logger.error("Error dalam fungsi terjadwal sendDailySalesSummary:", error);
    }
});
//# sourceMappingURL=index.js.map