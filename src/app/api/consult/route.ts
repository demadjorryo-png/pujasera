import { NextRequest, NextResponse } from 'next/server';
import { consultWithChika } from '@/ai/flows/app-consultant';
import type { AppConsultantInput } from '@/ai/flows/app-consultant';

export async function POST(req: NextRequest) {
  try {
    const { conversationHistory, userInput }: AppConsultantInput = await req.json();

    if (!userInput) {
      return NextResponse.json({ error: 'Invalid input: userInput is required' }, { status: 400 });
    }

    const result = await consultWithChika({
      conversationHistory: conversationHistory || '',
      userInput: userInput,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in consult API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
