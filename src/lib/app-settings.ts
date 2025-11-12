'use client';

// This file is DEPRECATED and its logic has been moved.
// The `deductAiUsageFee` function now resides in `src/lib/server/app-settings.ts` for server-side execution.
// The client-side dialog (`AIConfirmationDialog`) no longer handles deductions directly.

// You can safely delete this file if no other components are using it.
// For now, we'll keep the type definition and default object for any remaining client-side type dependencies.

export const defaultFeeSettings: TransactionFeeSettings = {
  tokenValueRp: 1000,
  feePercentage: 0.005,
  minFeeRp: 500,
  maxFeeRp: 2500,
  aiUsageFee: 1,
  newStoreBonusTokens: 50,
  aiBusinessPlanFee: 25,
  aiSessionFee: 5,
  aiSessionDurationMinutes: 30,
};

export type TransactionFeeSettings = typeof defaultFeeSettings;
