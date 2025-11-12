import { NextResponse } from 'next/server';
import { getTransactionFeeSettings } from '@/lib/server/app-settings';

export async function GET() {
  try {
    const settings = await getTransactionFeeSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching transaction fee settings:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
