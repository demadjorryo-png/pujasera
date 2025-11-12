
import { NextRequest, NextResponse } from 'next/server';
import { getWhatsappSettings } from '@/lib/whatsapp-settings';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'Missing storeId parameter' }, { status: 400 });
  }

  try {
    const settings = await getWhatsappSettings(storeId);
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching WhatsApp settings:', error);
    return NextResponse.json({ error: 'Failed to fetch WhatsApp settings' }, { status: 500 });
  }
}
