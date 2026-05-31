import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { sweepAbandonedRedemptions } from '@/features/subscriptions/sweep-abandoned';

export const dynamic = 'force-dynamic';

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const got = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  try {
    const { released } = await sweepAbandonedRedemptions(supabase);
    return NextResponse.json({ success: true, released });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[sweep-redemptions] failed', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
