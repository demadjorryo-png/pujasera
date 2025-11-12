
import { askChika } from '@/ai/flows/business-analyst';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { auth } = getFirebaseAdmin();
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authHeader.split('Bearer ')[1];
    await auth.verifyIdToken(idToken);

    const { question, activeStore } = await req.json();
    if (!question || !activeStore) {
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // The flow will now handle its own data fetching
    const result = await askChika({ question, activeStore });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in business-analyst route:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
