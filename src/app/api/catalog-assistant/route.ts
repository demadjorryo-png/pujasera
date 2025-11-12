import { NextRequest, NextResponse } from 'next/server';
import { catalogAssistantFlow } from '@/ai/flows/catalog-assistant';
import type { CatalogAssistantInput } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const input: CatalogAssistantInput = await request.json();

    if (!input.userQuestion || !input.productContext || !input.storeName) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const result = await catalogAssistantFlow(input);
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in catalog-assistant route:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
