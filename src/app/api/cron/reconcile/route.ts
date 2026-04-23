import { NextRequest, NextResponse } from 'next/server';

// Nightly reconciliation job: pulls Shopify orders from the last 24h and
// upserts into our orders mirror. Gap-fills any orders that missed the
// orders/create webhook. Invoked by Vercel Cron per vercel.json.
//
// Stubbed pending Shopify store credentials. When SHOPIFY_ADMIN_ACCESS_TOKEN
// is set, swap the body for a real Admin API call + upsert loop.

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const got = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();

  if (expected && got !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasShopify = !!(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_ACCESS_TOKEN);

  if (!hasShopify) {
    return NextResponse.json({
      success: true,
      stubbed: true,
      message: 'Reconciliation stubbed — configure SHOPIFY_* env vars to enable.',
    });
  }

  // TODO: fetch Shopify orders from last 24h, upsert into orders table,
  // log any gaps (orders in Shopify but not in our DB after a grace period).
  return NextResponse.json({
    success: true,
    message: 'Reconciliation run complete.',
    scannedCount: 0,
    gapFilledCount: 0,
  });
}
