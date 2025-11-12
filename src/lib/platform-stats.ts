
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export type PlatformStats = {
  totalRevenue: number;
  totalTransactions: number;
  monthlyGrowthData: { month: string; revenue: number }[];
  topStores: { storeName: string; totalRevenue: number }[];
  updatedAt: string; // ISO 8601 string
};

const defaultStats: PlatformStats = {
    totalRevenue: 0,
    totalTransactions: 0,
    monthlyGrowthData: Array(6).fill({ month: 'N/A', revenue: 0 }),
    topStores: [],
    updatedAt: new Date(0).toISOString()
};

/**
 * Fetches aggregated platform statistics from Firestore.
 * This data is expected to be generated and updated by a Cloud Function.
 * 
 * @returns {Promise<PlatformStats>} The aggregated platform statistics.
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  try {
    const statsDocRef = doc(db, 'platform', 'stats');
    const docSnap = await getDoc(statsDocRef);

    if (docSnap.exists()) {
      return docSnap.data() as PlatformStats;
    } else {
      console.warn("Platform stats document ('platform/stats') not found. Returning default stats. Ensure your Cloud Function is running and writing to this document.");
      // If the document doesn't exist, it means the Cloud Function hasn't run yet or is misconfigured.
      return defaultStats;
    }
  } catch (error) {
    console.error("Error fetching platform stats:", error);
    // Return default stats in case of any error to prevent the dashboard from crashing.
    return defaultStats;
  }
}
