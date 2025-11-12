import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { ReceiptSettings } from './types';

// Default settings if a store doesn't have any defined.
export const defaultReceiptSettings: ReceiptSettings = {
    headerText: "Toko Chika\nJl. Jenderal Sudirman No. 1, Jakarta\nTelp: 0812-3456-7890",
    footerText: "Terima kasih telah berbelanja!",
    promoText: "Kumpulkan poin dan dapatkan hadiah menarik!",
    voiceGender: "female", // Default female voice
    notificationStyle: "fakta", // Default to fun facts
};

/**
 * Fetches receipt settings for a specific store from Firestore.
 * @param storeId The ID of the store.
 * @returns The store's specific receipt settings, or default settings if not found.
 */
export async function getReceiptSettings(storeId: string): Promise<ReceiptSettings> {
    try {
        const storeDocRef = doc(db, 'stores', storeId);
        const docSnap = await getDoc(storeDocRef);

        if (docSnap.exists()) {
            const storeData = docSnap.data();
            // Merge store settings with defaults to ensure all fields are present
            return { ...defaultReceiptSettings, ...storeData.receiptSettings };
        } else {
            console.warn(`Store with ID ${storeId} not found. Using default receipt settings.`);
            return defaultReceiptSettings;
        }
    } catch (error) {
        console.error("Error fetching receipt settings:", error);
        // Return defaults in case of any error
        return defaultReceiptSettings;
    }
}

/**
 * Updates or creates receipt settings for a specific store in Firestore.
 * This function now reads the existing settings first to merge them safely.
 * @param storeId The ID of the store to update.
 * @param newSettings An object containing the settings to update.
 */
export async function updateReceiptSettings(storeId: string, newSettings: Partial<ReceiptSettings>) {
    const storeDocRef = doc(db, 'stores', storeId);
    try {
        // First, get the current settings to ensure we don't overwrite anything.
        const currentSettings = await getReceiptSettings(storeId);
        
        // Merge the current settings with the new ones.
        const updatedSettings = {
            ...currentSettings,
            ...newSettings,
        };

        // Use setDoc with merge: true to update the nested receiptSettings object.
        await setDoc(storeDocRef, {
            receiptSettings: updatedSettings
        }, { merge: true });
        
        console.log(`Receipt settings updated for store ${storeId}.`);
    } catch (error) {
        console.error(`Error updating receipt settings for store ${storeId}:`, error);
        throw error; // Re-throw the error to be handled by the caller
    }
}
