import { NextRequest, NextResponse } from 'next/server';
import { consultWithChika } from '@/ai/flows/app-consultant';
import type { AppConsultantInput } from '@/ai/flows/app-consultant';

export async function POST(request: NextRequest) {
  try {
    const input: AppConsultantInput = await request.json();

    const { conversationHistory, userInput } = input;

    if (!userInput) {
      return NextResponse.json({ error: 'Missing required input parameter: userInput' }, { status: 400 });
    }

    const result = await consultWithChika(input);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in consultWithChika API route:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get app consultant response';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
