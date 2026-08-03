import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyRxToken } from '@/features/rx-intake/lib/rx-token';
import { createRateLimiter, clientIpFrom } from '@/lib/security/rate-limit';

const limiter = createRateLimiter({ windowMs: 60_000, max: 30 });

export async function GET(request: NextRequest) {
  if (!limiter(clientIpFrom(request.headers))) {
    return NextResponse.json({ error: 'Too many requests — please try again shortly' }, { status: 429 });
  }
  const orderId = request.nextUrl.searchParams.get('orderId');
  if (!orderId) {
    return NextResponse.json({ error: 'orderId required' }, { status: 400 });
  }

  // Require the same Rx token the /rx page holds, so this can't be used as an
  // anonymous oracle to confirm which order numbers exist.
  const token = request.nextUrl.searchParams.get('token');
  const exp = Number(request.nextUrl.searchParams.get('exp'));
  if (!token || !exp || !verifyRxToken(orderId, token, exp)) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('orders')
    .select('id')
    .eq('shopify_order_number', orderId)
    .maybeSingle();

  return NextResponse.json({ exists: !!data });
}
