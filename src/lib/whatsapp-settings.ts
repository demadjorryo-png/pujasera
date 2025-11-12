
import { adminDb } from './firebase-admin';

export type WhatsappSettings = {
    deviceId: string;
    adminGroup: string; // The group name or ID for admin notifications
};

// Default settings if the document doesn't exist in Firestore.
export const defaultWhatsappSettings: WhatsappSettings = {
    deviceId: 'fa254b2588ad7626d647da23be4d6a08',
    adminGroup: 'SPV ERA MMBP',
};

/**
 * Fetches WhatsApp settings from Firestore using the Admin SDK.
 * This function is intended for server-side use only (e.g., in Cloud Functions).
 * @param storeId The ID of the store (can be "platform" for global settings).
 * @returns The WhatsApp settings, or default settings if not found.
 */
export async function getWhatsappSettings(storeId: string): Promise<WhatsappSettings> {
    const settingsDocRef = adminDb.collection('appSettings').doc('whatsappConfig');
    try {
        const docSnap = await settingsDocRef.get();

        if (docSnap.exists) {
            // Merge with defaults to ensure all properties are present
            return { ...defaultWhatsappSettings, ...docSnap.data() as WhatsappSettings };
        } else {
            console.warn(`WhatsApp settings not found, creating document with default values.`);
            // If the document doesn't exist, create it with default values
            await settingsDocRef.set(defaultWhatsappSettings);
            return defaultWhatsappSettings;
        }
    } catch (error) {
        console.error("Error fetching WhatsApp settings:", error);
        // Return defaults in case of any error
        return defaultWhatsappSettings;
    }
}

/**
 * // Temporarily disabled: This function is intended for client-side updates
 * // and uses client-side Firebase SDK. It should not be part of Cloud Functions.
 * // If needed, refactor to use Firebase Admin SDK or a separate API endpoint.
 * export async function updateWhatsappSettings(newSettings: Partial<WhatsappSettings>) {
 *     // We are using adminDb for server-side operations, which does not have `db`.
 *     // This function would typically interact with the client-side Firebase `db`.
 *     // If this function is truly needed within a Cloud Function context, it needs
 *     // to be rewritten to use the Firebase Admin SDK.
 *     console.error("updateWhatsappSettings is not implemented for Cloud Functions.");
 *     throw new Error("updateWhatsappSettings is not available in this environment.");
 * }
*/
