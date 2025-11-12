import { getFirebaseAdmin } from './firebase-admin';

export type WhatsappSettings = {
    deviceId: string;
    adminGroup: string; // The group name or ID for admin notifications
};

/**
 * Retrieves WhatsApp settings directly from environment variables.
 * This is the single source of truth for these settings on the server.
 * @returns The WhatsApp settings object.
 */
export function getWhatsappSettings(): WhatsappSettings {
    const deviceId = process.env.WHATSAPP_DEVICE_ID;
    const adminGroup = process.env.WHATSAPP_ADMIN_GROUP;

    if (!deviceId) {
        console.warn("WHATSAPP_DEVICE_ID environment variable is not set.");
    }
    if (!adminGroup) {
        console.warn("WHATSAPP_ADMIN_GROUP environment variable is not set.");
    }

    return {
        deviceId: deviceId || '',
        adminGroup: adminGroup || '',
    };
}
