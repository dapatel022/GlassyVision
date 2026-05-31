import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyWebhook } from '@/lib/utils/hmac';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncShopifyOrder, type ShopifyOrderPayload } from '@/lib/commerce/sync';
import { anonymizeCustomer } from '@/features/account/actions/anonymize-customer';
import type { Json } from '@/lib/supabase/types';

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

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventId = shopifyEventId || crypto.randomUUID();

  // Atomic idempotency: insert the event row and rely on the unique constraint
  // on shopify_event_id instead of a check-then-act SELECT (Shopify delivers
  // at-least-once, so two concurrent deliveries would both pass a SELECT).
  const { data: inserted, error: insertErr } = await supabase
    .from('webhook_events')
    .insert({ shopify_event_id: eventId, topic, payload: payload as Json })
    .select('id')
    .single();

  let eventRowId: string | null = inserted?.id ?? null;

  if (insertErr) {
    if (insertErr.code === '23505') {
      // Already received. Only reprocess if the prior attempt did not complete
      // (processed_at is null) — otherwise this is a true duplicate.
      const { data: existing } = await supabase
        .from('webhook_events')
        .select('id, processed_at')
        .eq('shopify_event_id', eventId)
        .maybeSingle();
      if (!existing || existing.processed_at) {
        return NextResponse.json({ status: 'already_processed' });
      }
      eventRowId = existing.id;
    } else {
      // Unexpected DB failure — return 5xx so Shopify retries the delivery.
      console.error('[webhook] failed to record event', insertErr);
      return NextResponse.json({ error: 'event log failed' }, { status: 500 });
    }
  }

  try {
    switch (topic) {
      case 'orders/create':
      case 'orders/updated': {
        const syncResult = await syncShopifyOrder(payload as ShopifyOrderPayload, supabase);
        if (!syncResult.success) {
          throw new Error(`Sync failed: ${syncResult.error}`);
        }
        break;
      }
      case 'orders/cancelled': {
        const shopifyOrderId = (payload as { id?: number }).id;
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
        const productPayload = payload as { id?: number; variants?: Array<{ id: number; sku?: string }> };
        const shopifyProductId = productPayload.id;
        const variants = productPayload.variants || [];
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
      case 'customers/redact': {
        const shopifyCustomerId = (payload as { customer?: { id?: number } }).customer?.id;
        if (shopifyCustomerId) {
          const { data: customer } = await supabase
            .from('customers')
            .select('id')
            .eq('shopify_customer_id', shopifyCustomerId)
            .maybeSingle();
          if (customer) {
            await anonymizeCustomer(customer.id);
          }
        }
        break;
      }
      case 'shop/redact': {
        // Shop-level erasure request: no per-customer action needed for us.
        console.log('Received shop/redact');
        break;
      }
      default:
        console.log(`Unhandled webhook topic: ${topic}`);
    }

    // Mark as processed successfully
    if (eventRowId) {
      await supabase
        .from('webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', eventRowId);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    if (eventRowId) {
      await supabase
        .from('webhook_events')
        .update({
          processing_error: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', eventRowId);
    }

    // Return 5xx so Shopify retries the delivery (its built-in backoff is our
    // retry mechanism). The row is left with processed_at null + an error,
    // which also serves as the dead-letter record for manual replay.
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
