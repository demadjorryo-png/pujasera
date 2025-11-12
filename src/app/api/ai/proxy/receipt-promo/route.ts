import { NextResponse } from 'next/server';
import { receiptPromoFlow } from '@/ai/flows/receipt-promo-generator';
import type { ReceiptPromoInput } from '@/ai/flows/receipt-promo-generator';


// Very small example of a server-side proxy endpoint that forwards requests to
// a specific AI flow. This endpoint includes basic in-memory rate limiting and
// simple logging. Adapt/replace with production-appropriate rate limiters and
// authentication (e.g., Firebase auth token checks) as needed.

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

const ipRequestLog = new Map<string, { count: number; windowStart: number }>();

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';

    // Basic rate limiting
    const now = Date.now();
    const entry = ipRequestLog.get(ip) || { count: 0, windowStart: now };
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      entry.count = 0;
      entry.windowStart = now;
    }
    entry.count += 1;
    ipRequestLog.set(ip, entry);

    if (entry.count > MAX_REQUESTS_PER_WINDOW) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const body = await req.json();
    const input: ReceiptPromoInput = body?.input;
    if (!input) {
      return NextResponse.json({ error: 'Missing input in request body' }, { status: 400 });
    }

    const result = await receiptPromoFlow(input);

    return NextResponse.json(result);
  } catch (err: unknown) {
    let message = 'Internal Server Error';
    if (err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
      message = (err as { message: string }).message;
    }
    console.error('AI proxy error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
