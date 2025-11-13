
import { NextRequest, NextResponse } from 'next/server';
import { getWhatsappSettings } from '@/lib/server/whatsapp-settings';

export async function GET(request: NextRequest) {
  try {
    const settings = await getWhatsappSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching WhatsApp settings:', error);
    return NextResponse.json({ error: 'Failed to fetch WhatsApp settings' }, { status: 500 });
  }
}
