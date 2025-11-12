import { NextRequest, NextResponse } from 'next/server';
import { challengeGeneratorFlow } from '@/ai/flows/challenge-generator';
import type { ChallengeGeneratorInput } from '@/ai/flows/challenge-generator';


export async function POST(request: NextRequest) {
  const input: ChallengeGeneratorInput = await request.json();

  if (!input.budget || !input.startDate || !input.endDate || !input.activeStoreName || !input.businessDescription) {
    return NextResponse.json({ error: 'Missing required input parameters' }, { status: 400 });
  }

  try {
    const result = await challengeGeneratorFlow(input);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in challengeGeneratorFlow API route:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate challenges';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
