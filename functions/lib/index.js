
'use server';
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDailySalesSummary = exports.onTopUpRequestUpdate = exports.onTopUpRequestCreate = exports.processPujaseraQueue = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const logger = __importStar(require("firebase-functions/logger"));
const firestore_2 = require("firebase-admin/firestore");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const date_fns_1 = require("date-fns");
const format_1 = require("date-fns/format");
const locale_1 = require("date-fns/locale");
// Initialize Firebase Admin SDK if not already initialized
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_2.getFirestore)();
const adminAuth = (0, auth_1.getAuth)();
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
async function internalSendWhatsapp(deviceId, target, message, isGroup = false) {
    const formData = new FormData();
    formData.append('device_id', deviceId);
    formData.append(isGroup ? 'group' : 'number', target);
    formData.append('message', message);
    const endpoint = isGroup ? 'sendGroup' : 'send';
    const webhookUrl = `https://app.whacenter.com/api/${endpoint}`;
    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(webhookUrl, {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) {
            const responseJson = await response.json();
            logger.error('WhaCenter API HTTP Error:', { status: response.status, body: responseJson });
        }
        else {
            const responseJson = await response.json();
            if (responseJson.status === 'error') {
                logger.error('WhaCenter API Error:', responseJson.reason);
            }
        }
    }
    catch (error) {
        logger.error("Failed to send WhatsApp message:", error);
    }
}
function formatWhatsappNumber(nomor) {
    if (!nomor)
        return '';
    let nomorStr = String(nomor).replace(/\D/g, '');
    if (nomorStr.startsWith('0')) {
        return '62' + nomorStr.substring(1);
    }
    if (nomorStr.startsWith('8')) {
        return '62' + nomorStr;
    }
    return nomorStr;
}
/**
 * Main function to handle all queued tasks.
 * It now orchestrates order processing, distribution, and WhatsApp notifications.
 */
exports.processPujaseraQueue = (0, firestore_1.onDocumentCreated)("Pujaseraqueue/{jobId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        logger.info("No data associated with the event, exiting.");
        return;
    }
    const jobData = snapshot.data();
    const { type, payload } = jobData;
    try {
        await snapshot.ref.update({ status: 'processing', startedAt: firestore_2.FieldValue.serverTimestamp() });
        switch (type) {
            case 'pujasera-order':
                await handlePujaseraOrder(payload);
                await snapshot.ref.update({ status: 'completed', processedAt: firestore_2.FieldValue.serverTimestamp() });
                break;
            case 'whatsapp-notification':
                await handleWhatsappNotification(payload);
                await snapshot.ref.update({ status: 'sent', processedAt: firestore_2.FieldValue.serverTimestamp() });
                break;
            default:
                logger.warn(`Unknown job type: ${type}`);
                await snapshot.ref.update({ status: 'unknown_type', error: `Unknown job type: ${type}`, processedAt: firestore_2.FieldValue.serverTimestamp() });
        }
    }
    catch (error) {
        logger.error(`Failed to process job ${snapshot.id} of type ${type}:`, error);
        await snapshot.ref.update({ status: 'failed', error: error.message, processedAt: firestore_2.FieldValue.serverTimestamp() });
    }
});
async function handlePujaseraOrder(payload) {
    var _a, _b, _c, _d;
    const { pujaseraId, customer, cart, subtotal, taxAmount, serviceFeeAmount, totalAmount, paymentMethod, staffId, pointsEarned, pointsToRedeem, tableId, isFromCatalog } = payload;
    if (!pujaseraId || !customer || !cart || cart.length === 0) {
        throw new Error("Data pesanan tidak lengkap.");
    }
    const batch = db.batch();
    const pujaseraStoreRef = db.doc(`stores/${pujaseraId}`);
    const pujaseraStoreDoc = await pujaseraStoreRef.get();
    if (!pujaseraStoreDoc.exists)
        throw new Error("Pujasera tidak ditemukan.");
    const pujaseraData = pujaseraStoreDoc.data();
    const pujaseraCounter = pujaseraData.transactionCounter || 0;
    const newReceiptNumber = pujaseraCounter + 1;
    // Group items by tenant for distribution
    const itemsByTenant = {};
    for (const item of cart) {
        if (!item.storeId || !item.storeName)
            continue;
        if (!itemsByTenant[item.storeId]) {
            itemsByTenant[item.storeId] = { storeName: item.storeName, items: [] };
        }
        itemsByTenant[item.storeId].items.push(item);
    }
    // Main Transaction
    const newTxRef = db.collection('stores').doc(pujaseraId).collection('transactions').doc();
    const newTransactionData = {
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
    newTransactionData.itemsStatus = Object.keys(itemsByTenant).reduce((acc, tenantId) => (Object.assign(Object.assign({}, acc), { [tenantId]: 'Diproses' })), {});
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
    }
    else if (tableId && paymentMethod !== 'Belum Dibayar') { // For POS orders
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
    const feePercentage = (_a = feeSettings.feePercentage) !== null && _a !== void 0 ? _a : 0.005;
    const minFeeRp = (_b = feeSettings.minFeeRp) !== null && _b !== void 0 ? _b : 500;
    const maxFeeRp = (_c = feeSettings.maxFeeRp) !== null && _c !== void 0 ? _c : 2500;
    const tokenValueRp = (_d = feeSettings.tokenValueRp) !== null && _d !== void 0 ? _d : 1000;
    const feeFromPercentage = totalAmount * feePercentage;
    const feeCappedAtMin = Math.max(feeFromPercentage, minFeeRp);
    const feeCappedAtMax = Math.min(feeCappedAtMin, maxFeeRp);
    const transactionFee = feeCappedAtMax / tokenValueRp;
    batch.update(pujaseraStoreRef, {
        transactionCounter: firestore_2.FieldValue.increment(1),
        pradanaTokenBalance: firestore_2.FieldValue.increment(-transactionFee)
    });
    await batch.commit();
}
async function handleWhatsappNotification(payload) {
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
    const responseJson = await response.json();
    if (!response.ok || responseJson.status === 'error') {
        throw new Error(responseJson.reason || `WhaCenter API error with status ${response.status}`);
    }
    logger.info(`Successfully sent WhatsApp message via queue to ${recipient}`);
}
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
    try {
        // 1. Sync data to the store's subcollection for their history
        const historyRef = db.collection('stores').doc(storeId).collection('topUpRequests').doc(snapshot.id);
        await historyRef.set(requestData);
        logger.info(`Synced top-up request ${snapshot.id} to store ${storeId}`);
        // 2. Send notification directly to admin group
        const { deviceId, adminGroup } = getWhatsappSettings();
        if (deviceId && adminGroup) {
            const formattedAmount = (tokensToAdd || 0).toLocaleString('id-ID');
            const adminMessage = `🔔 *Permintaan Top-up Baru*\n\nToko: *${storeName}*\nPengaju: *${userName || 'N/A'}*\nJumlah: *${formattedAmount} token*\n\nMohon segera verifikasi di panel admin.\nBukti: ${proofUrl || 'Tidak ada'}`;
            await internalSendWhatsapp(deviceId, adminGroup, adminMessage, true);
            logger.info(`Sent new top-up request notification for platform admin.`);
        }
        else {
            logger.warn("Admin WhatsApp notification for new top-up skipped: deviceId or adminGroup not configured.");
        }
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
    if (before.status !== 'pending' || before.status === after.status) {
        return;
    }
    const { storeId, storeName, status, tokensToAdd, userId } = after;
    const requestId = event.params.requestId;
    if (!storeId || !storeName) {
        logger.error(`Request ${requestId} is missing 'storeId' or 'storeName'. Cannot process update.`);
        return;
    }
    const { deviceId, adminGroup } = getWhatsappSettings();
    if (!deviceId) {
        logger.error("WhatsApp Device ID not configured. Cannot send top-up update notifications.");
        return;
    }
    const formattedAmount = (tokensToAdd || 0).toLocaleString('id-ID');
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
        return;
    }
    try {
        // Notify customer directly
        if (customerWhatsapp) {
            const formattedPhone = formatWhatsappNumber(customerWhatsapp);
            await internalSendWhatsapp(deviceId, formattedPhone, customerMessage, false);
            logger.info(`Sent '${status}' notification for customer ${customerName} of store ${storeId}`);
        }
        else {
            logger.warn(`User ${userId} for store ${storeId} does not have a WhatsApp number. Cannot send notification.`);
        }
        // Notify admin group directly
        if (adminGroup) {
            await internalSendWhatsapp(deviceId, adminGroup, adminMessage, true);
            logger.info(`Sent '${status}' notification for admin group for request from ${storeName}.`);
        }
    }
    catch (error) {
        logger.error(`Failed to send notifications for request ${requestId}:`, error);
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
            const adminDocs = await Promise.all(store.adminUids.map((uid) => db.collection('users').doc(uid).get()));
            const formattedDate = (0, format_1.format)(yesterday, "EEEE, d MMMM yyyy", { locale: locale_1.id });
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
