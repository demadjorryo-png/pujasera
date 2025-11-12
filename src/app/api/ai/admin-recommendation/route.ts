import { NextRequest, NextResponse } from 'next/server';
import { adminRecommendationFlow } from '@/ai/flows/admin-recommendation';
import type { AdminRecommendationInput } from '@/ai/flows/admin-recommendation';

export async function POST(request: NextRequest) {
  const input: AdminRecommendationInput = await request.json();

  if (!input.businessDescription || !input.topSellingProducts || !input.worstSellingProducts) {
    return NextResponse.json({ error: 'Missing required input parameters' }, { status: 400 });
  }

  try {
    const result = await adminRecommendationFlow(input);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in adminRecommendationFlow API route:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get admin recommendations';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
