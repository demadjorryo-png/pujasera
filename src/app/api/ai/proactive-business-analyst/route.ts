
import { proactiveBusinessAnalystFlow } from '@/ai/flows/proactive-business-analyst';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { auth } = getFirebaseAdmin();
    // 1. Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authHeader.split('Bearer ')[1];
    await auth.verifyIdToken(idToken);

    // 2. Get the required input
    const { activeStore } = await req.json();
    if (!activeStore || !activeStore.id) {
        return NextResponse.json({ error: 'Active store not provided' }, { status: 400 });
    }

    // 3. Run the flow directly
    const result = await proactiveBusinessAnalystFlow({ activeStore });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in proactive-business-analyst route:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
