import { NextRequest, NextResponse } from 'next/server';
import { loyaltyPointRecommendationFlow } from '@/ai/flows/loyalty-point-recommendation';
import type { LoyaltyPointRecommendationInput } from '@/ai/flows/loyalty-point-recommendation';


export async function POST(request: NextRequest) {
  const input: LoyaltyPointRecommendationInput = await request.json();

  const { loyaltyPoints, totalPurchaseAmount, availableRedemptionOptions } = input;

  if (loyaltyPoints === undefined || totalPurchaseAmount === undefined || !availableRedemptionOptions) {
    return NextResponse.json({ error: 'Missing required input parameters' }, { status: 400 });
  }

  try {
    // Memanggil flow AI yang sebenarnya
    const result = await loyaltyPointRecommendationFlow(input);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in loyaltyPointRecommendationFlow API route:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get loyalty point recommendation';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
