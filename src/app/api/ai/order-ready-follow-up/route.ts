import { NextRequest, NextResponse } from 'next/server';
import { orderReadyFollowUpFlow } from '@/ai/flows/order-ready-follow-up';
import type { OrderReadyFollowUpInput } from '@/ai/flows/order-ready-follow-up';


export async function POST(request: NextRequest) {
  const input: OrderReadyFollowUpInput = await request.json();

  const { customerName, storeName, itemsOrdered, currentTime, notificationStyle } = input;

  if (!customerName || !storeName || !itemsOrdered || !currentTime || !notificationStyle) {
    return NextResponse.json({ error: 'Missing required input parameters' }, { status: 400 });
  }

  try {
    const result = await orderReadyFollowUpFlow(input);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error calling orderReadyFollowUpFlow API route:', error);
    return NextResponse.json({ error: 'Failed to get order ready follow-up message' }, { status: 500 });
  }
}
