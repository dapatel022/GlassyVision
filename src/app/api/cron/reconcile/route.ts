import { NextRequest, NextResponse } from 'next/server';
import { adminFetch } from '@/lib/commerce/shopify-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncShopifyOrder, type ShopifyOrderPayload } from '@/lib/commerce/sync';

export const dynamic = 'force-dynamic';

interface ShopifyOrdersResponse {
  orders: ShopifyOrderPayload[];
}

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

  const supabase = createAdminClient();
  let scannedCount = 0;
  let gapFilledCount = 0;

  try {
    // Look back 48 hours to ensure webhooks gaps are fully covered
    const dateMin = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const data = await adminFetch<ShopifyOrdersResponse>(
      `orders.json?status=any&created_at_min=${encodeURIComponent(dateMin)}`
    );

    const orders = data?.orders || [];
    scannedCount = orders.length;

    for (const order of orders) {
      if (!order.id) continue;
      // Check if order already exists in our database mirror
      const { data: existing } = await supabase
        .from('orders')
        .select('id')
        .eq('shopify_order_id', order.id)
        .maybeSingle();

      if (!existing) {
        gapFilledCount++;
      }

      const syncResult = await syncShopifyOrder(order, supabase);
      if (!syncResult.success) {
        console.error(`[reconcile] Failed to sync order ${order.id}: ${syncResult.error}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Reconciliation run complete.',
      scannedCount,
      gapFilledCount,
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
