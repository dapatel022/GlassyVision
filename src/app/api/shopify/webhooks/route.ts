import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyWebhook } from '@/lib/utils/hmac';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const hmac = request.headers.get('x-shopify-hmac-sha256') || '';
  const topic = request.headers.get('x-shopify-topic') || '';
  const shopifyEventId = request.headers.get('x-shopify-webhook-id') || '';

  // Verify HMAC
  if (!verifyShopifyWebhook(body, hmac, process.env.SHOPIFY_WEBHOOK_SECRET!)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const payload = JSON.parse(body);

  // Idempotency check
  if (shopifyEventId) {
    const { data: existing } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('shopify_event_id', shopifyEventId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ status: 'already_processed' });
    }
  }

  // Log the event
  const { data: event } = await supabase
    .from('webhook_events')
    .insert({
      shopify_event_id: shopifyEventId || crypto.randomUUID(),
      topic,
      payload,
    })
    .select('id')
    .single();

  try {
    // Dispatch to topic-specific handlers
    // Handlers will be added in Week 3 (Task: webhook handlers)
    switch (topic) {
      case 'orders/create':
        // TODO: Week 3 — mirror order, send Rx reminder
        break;
      case 'orders/updated':
        // TODO: Week 3 — update order mirror
        break;
      case 'orders/cancelled':
        // TODO: Week 3 — cancel pending work orders
        break;
      case 'products/update':
        // TODO: Week 3 — refresh product_metadata cache
        break;
      default:
        console.log(`Unhandled webhook topic: ${topic}`);
    }

    // Mark as processed
    if (event) {
      await supabase
        .from('webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', event.id);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    // Log error but return 200 (Shopify retries on non-2xx)
    if (event) {
      await supabase
        .from('webhook_events')
        .update({
          processing_error: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', event.id);
    }

    return NextResponse.json({ status: 'error_logged' });
  }
}
