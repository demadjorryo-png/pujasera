
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
import { getTransactionFeeSettings } from '@/lib/server/app-settings';
import { addMonths } from 'date-fns';

export async function POST(req: NextRequest) {
  const { auth, db } = getFirebaseAdmin();
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });
  }
  const idToken = authorization.split('Bearer ')[1];
  
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    const { storeId, planId } = await req.json();

    if (!storeId || !planId || !['trial', 1, 6, 12].includes(planId)) {
        return NextResponse.json({ error: 'Data tidak valid: storeId dan planId (trial, 1, 6, 12) diperlukan.' }, { status: 400 });
    }

    const feeSettings = await getTransactionFeeSettings();
    let feeToDeduct = 0;
    let monthsToAdd = 0;

    switch (planId) {
        case 'trial': 
            feeToDeduct = feeSettings.catalogTrialFee; 
            monthsToAdd = feeSettings.catalogTrialDurationMonths;
            break;
        case 1: 
            feeToDeduct = feeSettings.catalogMonthlyFee; 
            monthsToAdd = 1;
            break;
        case 6: 
            feeToDeduct = feeSettings.catalogSixMonthFee; 
            monthsToAdd = 6;
            break;
        case 12: 
            feeToDeduct = feeSettings.catalogYearlyFee; 
            monthsToAdd = 12;
            break;
    }

    const storeRef = db.collection('stores').doc(storeId);

    const result = await db.runTransaction(async (transaction) => {
        const storeDoc = await transaction.get(storeRef);
        if (!storeDoc.exists) {
            throw new Error('Toko tidak ditemukan.');
        }

        const storeData = storeDoc.data();
        const currentBalance = storeData?.pradanaTokenBalance || 0;

        if (currentBalance < feeToDeduct) {
            throw new Error(`Saldo Token tidak cukup. Saldo saat ini: ${currentBalance.toFixed(2)}, dibutuhkan: ${feeToDeduct}.`);
        }
        
        if (planId === 'trial' && storeData?.hasUsedCatalogTrial) {
            throw new Error('Penawaran ini hanya berlaku satu kali untuk setiap toko.');
        }

        const currentExpiry = storeData?.catalogSubscriptionExpiry ? new Date(storeData.catalogSubscriptionExpiry) : new Date();
        const newExpiryDate = addMonths(currentExpiry > new Date() ? currentExpiry : new Date(), monthsToAdd);

        const updateData: { [key: string]: any } = {
            pradanaTokenBalance: currentBalance - feeToDeduct,
            catalogSubscriptionExpiry: newExpiryDate.toISOString(),
            isCatalogPublished: true,
        };

        if (planId === 'trial') {
            updateData.hasUsedCatalogTrial = true;
        }

        transaction.update(storeRef, updateData);
        
        return { newExpiryDate: newExpiryDate.toISOString(), newBalance: currentBalance - feeToDeduct };
    });

    return NextResponse.json({ success: true, ...result });

  } catch (error) {
    console.error('Error processing catalog subscription:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
