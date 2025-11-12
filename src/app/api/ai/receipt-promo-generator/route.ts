import { NextRequest, NextResponse } from 'next/server';
import { receiptPromoFlow } from '@/ai/flows/receipt-promo-generator';
import type { ReceiptPromoInput } from '@/ai/flows/receipt-promo-generator';

export async function POST(request: NextRequest) {
  const input: ReceiptPromoInput = await request.json();

  const { activePromotions, activeStoreName } = input;

  if (!activePromotions || !activeStoreName) {
    return NextResponse.json({ error: 'Missing required input parameters' }, { status: 400 });
  }

  try {
    const result = await receiptPromoFlow(input);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in receiptPromoFlow API route:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate receipt promo';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
