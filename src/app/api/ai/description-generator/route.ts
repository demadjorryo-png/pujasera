
import { NextRequest, NextResponse } from 'next/server';
import { generateDescription } from '@/ai/flows/description-generator';
import type { DescriptionGeneratorInput } from '@/ai/flows/description-generator';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const { auth } = getFirebaseAdmin();
    // 1. Authenticate the user
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authHeader.split('Bearer ')[1];
    await auth.verifyIdToken(idToken);

    // 2. Validate input
    const { productName, category, topSellingProducts }: DescriptionGeneratorInput = await request.json();
    if (!productName || !category) {
      return NextResponse.json({ error: 'Missing required parameters: productName and category' }, { status: 400 });
    }

    // 3. Run the flow
    const result = await generateDescription({ productName, category, topSellingProducts });
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in description-generator route:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
