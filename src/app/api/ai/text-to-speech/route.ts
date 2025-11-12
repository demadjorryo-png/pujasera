import { NextRequest, NextResponse } from 'next/server';
import { textToSpeechFlow } from '@/ai/flows/text-to-speech';
import type { TextToSpeechInput } from '@/ai/flows/text-to-speech';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';

export async function POST(request: NextRequest) {
  const { auth } = getFirebaseAdmin();
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });
  }
  const idToken = authorization.split('Bearer ')[1];

  try {
    // Verify the user's token to ensure they are authenticated
    await auth.verifyIdToken(idToken);
    
    const input: TextToSpeechInput = await request.json();

    const { text, gender } = input;

    if (!text) {
      return NextResponse.json({ error: 'Missing required input parameter: text' }, { status: 400 });
    }

    const result = await textToSpeechFlow({ text, gender });
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in textToSpeechFlow API route:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to convert text to speech';
    const statusCode = (error as any)?.code === 'auth/id-token-expired' ? 401 : 500;
    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
}
