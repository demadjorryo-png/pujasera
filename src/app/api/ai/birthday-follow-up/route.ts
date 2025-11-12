import { NextRequest, NextResponse } from 'next/server';
import { birthdayFollowUpFlow } from '@/ai/flows/birthday-follow-up';
import type { BirthdayFollowUpInput } from '@/ai/flows/birthday-follow-up';

export async function POST(request: NextRequest) {
  const input: BirthdayFollowUpInput = await request.json();

  const { customerName, birthDate, discountPercentage } = input;

  if (!customerName || !birthDate || !discountPercentage) {
    return NextResponse.json({ error: 'Missing required input parameters' }, { status: 400 });
  }

  try {
    const result = await birthdayFollowUpFlow(input);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in birthdayFollowUpFlow API route:', error);
    return NextResponse.json({ error: 'Failed to generate birthday follow-up message' }, { status: 500 });
  }
}
