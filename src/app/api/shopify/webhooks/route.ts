import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyWebhook } from '@/lib/utils/hmac';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncShopifyOrder } from '@/lib/commerce/sync';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const hmac = request.headers.get('x-shopify-hmac-sha256') || '';
  const topic = request.headers.get('x-shopify-topic') || '';
  const shopifyEventId = request.headers.get('x-shopify-webhook-id') || '';

  // Verify HMAC signature
  if (!verifyShopifyWebhook(body, hmac, process.env.SHOPIFY_WEBHOOK_SECRET!)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const payload = JSON.parse(body);

  // Idempotency check to avoid double-processing
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

  // Log the inbound event
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
    switch (topic) {
      case 'orders/create':
      case 'orders/updated': {
        const syncResult = await syncShopifyOrder(payload, supabase);
        if (!syncResult.success) {
          throw new Error(`Sync failed: ${syncResult.error}`);
        }
        break;
      }
      case 'orders/cancelled': {
        const shopifyOrderId = payload.id;
        if (shopifyOrderId) {
          const { data: order } = await supabase
            .from('orders')
            .select('id')
            .eq('shopify_order_id', shopifyOrderId)
            .maybeSingle();

          if (order) {
            await supabase
              .from('orders')
              .update({
                financial_status: 'refunded',
                fulfillment_status: 'unfulfilled',
                rx_status: 'none',
                notes_internal: `Order cancelled in Shopify on ${new Date().toISOString()}`,
                updated_at: new Date().toISOString(),
              })
              .eq('id', order.id);

            const { data: workOrders } = await supabase
              .from('work_orders')
              .select('id')
              .eq('order_id', order.id);

            const workOrderIds = workOrders?.map((w) => w.id) || [];
            if (workOrderIds.length > 0) {
              await supabase
                .from('lab_jobs')
                .delete()
                .in('work_order_id', workOrderIds)
                .is('completed_at', null);
            }
          }
        }
        break;
      }
      case 'products/update': {
        const shopifyProductId = payload.id;
        const variants = payload.variants || [];
        if (shopifyProductId && Array.isArray(variants)) {
          for (const variant of variants) {
            const shopifyVariantId = variant.id;
            const sku = variant.sku || '';

            const metadataObj = {
              shopify_product_id: shopifyProductId,
              shopify_variant_id: shopifyVariantId,
              sku: sku,
              last_synced_at: new Date().toISOString(),
            };

            await supabase
              .from('product_metadata')
              .upsert(metadataObj, { onConflict: 'shopify_product_id,shopify_variant_id' });
          }
        }
        break;
      }
      default:
        console.log(`Unhandled webhook topic: ${topic}`);
    }

    // Mark as processed successfully
    if (event) {
      await supabase
        .from('webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', event.id);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    if (event) {
      await supabase
        .from('webhook_events')
        .update({
          processing_error: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', event.id);
    }

    // Return 200 to acknowledge receipt to Shopify, logging the error internally
    return NextResponse.json({ status: 'error_logged' });
  }
}
