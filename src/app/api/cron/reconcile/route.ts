import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { adminFetchPage } from '@/lib/commerce/shopify-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncShopifyOrder, type ShopifyOrderPayload } from '@/lib/commerce/sync';

export const dynamic = 'force-dynamic';

interface ShopifyOrdersResponse {
  orders: ShopifyOrderPayload[];
}

// Fail CLOSED (unset secret → denied) with a constant-time compare, matching the
// other crons. The previous `expected && got !== expected` check ran the
// reconciliation publicly whenever CRON_SECRET was unset.
function authorize(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const got = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
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

  const supabase = createAdminClient();
  let scannedCount = 0;
  let gapFilledCount = 0;

  try {
    // Look back 48 hours to ensure webhook gaps are fully covered. Filter on
    // updated_at (not created_at) so an order created earlier but whose state
    // changed recently — e.g. a late payment capture whose webhook was missed —
    // is still reconciled.
    const dateMin = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Page through ALL matching orders via cursor pagination. Shopify caps a
    // page at 250 and only accepts limit+page_info on subsequent pages, so the
    // filter goes on the first request only. A page cap bounds a runaway loop.
    const MAX_PAGES = 50;
    let endpoint = `orders.json?status=any&limit=250&updated_at_min=${encodeURIComponent(dateMin)}`;
    let pages = 0;

    for (;;) {
      const { data, nextPageInfo } = await adminFetchPage<ShopifyOrdersResponse>(endpoint);
      const orders = data?.orders || [];
      scannedCount += orders.length;

      for (const order of orders) {
        if (!order.id) continue;
        const { data: existing } = await supabase
          .from('orders')
          .select('id')
          .eq('shopify_order_id', order.id)
          .maybeSingle();

        const syncResult = await syncShopifyOrder(order, supabase);
        if (!syncResult.success) {
          console.error(`[reconcile] Failed to sync order ${order.id}: ${syncResult.error}`);
        } else if (!existing) {
          // Count a gap as filled only once the missing order actually synced.
          gapFilledCount++;
        }
      }

      pages++;
      if (!nextPageInfo || pages >= MAX_PAGES) {
        if (nextPageInfo) {
          console.warn(`[reconcile] hit MAX_PAGES (${MAX_PAGES}); ${scannedCount} scanned, more orders remain unscanned`);
        }
        break;
      }
      endpoint = `orders.json?limit=250&page_info=${encodeURIComponent(nextPageInfo)}`;
    }

    return NextResponse.json({
      success: true,
      message: 'Reconciliation run complete.',
      scannedCount,
      gapFilledCount,
      pagesScanned: pages,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[reconcile] Cron job failed', error);
    return NextResponse.json(
      { success: false, error: 'Reconciliation failed', detail: msg },
      { status: 500 }
    );
  }
}
