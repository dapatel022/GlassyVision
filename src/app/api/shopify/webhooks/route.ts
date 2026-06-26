import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyWebhook } from '@/lib/utils/hmac';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncShopifyOrder, type ShopifyOrderPayload } from '@/lib/commerce/sync';
import { provisionMembershipFromOrder } from '@/features/subscriptions/provision-membership';
import { confirmAddonPayment } from '@/features/subscriptions/confirm-addon-payment';
import { handleRefundWebhook } from '@/features/subscriptions/webhooks/handle-refund';
import { handleDisputeWebhook } from '@/features/subscriptions/webhooks/handle-dispute';
import { anonymizeCustomer } from '@/features/account/actions/anonymize-customer';
import type { Json } from '@/lib/supabase/types';
import { captureMessage } from '@/lib/observability/sentry';

const MAX_WEBHOOK_ATTEMPTS = 5;

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
        .select('id, processed_at, attempt_count')
        .eq('shopify_event_id', eventId)
        .maybeSingle();
      if (!existing || existing.processed_at) {
        return NextResponse.json({ status: 'already_processed' });
      }
      if ((existing.attempt_count ?? 0) >= MAX_WEBHOOK_ATTEMPTS) {
        // Park the poison pill: stop Shopify's retries (return 200) and leave a
        // durable, clearly-marked record for manual inspection.
        await supabase
          .from('webhook_events')
          .update({ processed_at: new Date().toISOString(), processing_error: `parked: exceeded ${MAX_WEBHOOK_ATTEMPTS} attempts` })
          .eq('id', existing.id);
        captureMessage(`Webhook parked after ${MAX_WEBHOOK_ATTEMPTS} failed attempts: topic=${topic} event=${eventId}`, 'warning');
        return NextResponse.json({ status: 'parked' });
      }
      await supabase
        .from('webhook_events')
        .update({ attempt_count: (existing.attempt_count ?? 0) + 1 })
        .eq('id', existing.id);
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
      case 'orders/updated':
      case 'orders/paid': {
        const syncResult = await syncShopifyOrder(payload as ShopifyOrderPayload, supabase);
        if (!syncResult.success) {
          throw new Error(`Sync failed: ${syncResult.error}`);
        }

        const shopifyOrderId = (payload as { id?: number }).id;
        const financialStatus = (payload as { financial_status?: string }).financial_status;

        // A subscription add-on (surcharge) checkout carries a `redemption_id`
        // line-item property and a membership purchase carries the plan product —
        // they are mutually exclusive. Add-on confirmation is amount-verified and
        // only advances a still-`pending_payment` redemption, so a replay is safe.
        if (syncResult.redemptionId && financialStatus === 'paid' && shopifyOrderId) {
          // Reconcile against the PRODUCT subtotal (line-items price, excludes
          // shipping/tax) and the paid order's line-item variant ids — never the
          // gross total. `subtotal_price` is Shopify's line-items subtotal (post
          // line-item discount, pre shipping/tax), mirrored to `orders.subtotal`.
          const orderPayload = payload as {
            subtotal_price?: number | string;
            line_items?: Array<{ variant_id?: number | null; quantity?: number | string }>;
          };
          const paidSubtotal = Number(orderPayload.subtotal_price ?? 0);
          const lineItems = (orderPayload.line_items ?? []).map((li) => ({
            variant_id: li.variant_id ?? null,
            quantity: Number(li.quantity ?? 0),
          }));
          await confirmAddonPayment(
            syncResult.redemptionId,
            { paidSubtotal, lineItems },
            shopifyOrderId,
            supabase,
          );
        } else if (shopifyOrderId) {
          // After the order is mirrored into Supabase, attempt subscription
          // provisioning. The helper is internally paid-gated and idempotent
          // (unique on shopify_order_id), so a duplicate delivery on any of these
          // topics — or a non-membership order — is a safe no-op.
          const { data: orderRow } = await supabase
            .from('orders')
            .select('id, shopify_order_id, customer_id, customer_email, currency, financial_status')
            .eq('shopify_order_id', shopifyOrderId)
            .maybeSingle();

          if (orderRow) {
            await provisionMembershipFromOrder(orderRow, supabase);
          }
        }
        break;
      }
      case 'refunds/create': {
        // A refund issued in the Shopify admin must reach Supabase or a refunded
        // customer's subscription slots stay redeemable (= free glasses).
        // Membership refund → membership `refunded` + uncommitted slots expired;
        // add-on refund → that redemption reverted to `available` + stock freed.
        // Idempotent + a safe no-op for non-subscription orders.
        await handleRefundWebhook(payload as { order_id?: number | null }, supabase);
        break;
      }
      case 'disputes/create': {
        // A chargeback against a membership purchase order freezes the
        // membership (`status='disputed'`) so no further slots can be redeemed
        // while the dispute is contested. No automatic refund — admin resolves
        // it manually. Idempotent + a safe no-op for non-subscription orders.
        await handleDisputeWebhook(payload as { order_id?: number | null }, supabase);
        break;
      }
      case 'orders/cancelled': {
        const cancelPayload = payload as { id?: number; financial_status?: string };
        const shopifyOrderId = cancelPayload.id;
        if (shopifyOrderId) {
          const { data: order } = await supabase
            .from('orders')
            .select('id, fulfillment_status')
            .eq('shopify_order_id', shopifyOrderId)
            .maybeSingle();

          if (order) {
            // Cancellation does NOT imply a refund — map the payload's actual
            // financial status (an unpaid/voided cancel is common) instead of
            // hardcoding 'refunded'. And never downgrade an order that already
            // shipped/delivered back to 'unfulfilled'.
            const fin = cancelPayload.financial_status;
            const financialStatus =
              fin === 'refunded' ? 'refunded' :
              fin === 'partially_refunded' ? 'partial_refund' :
              fin === 'paid' ? 'paid' : 'pending';
            const alreadyShipped = order.fulfillment_status === 'shipped' || order.fulfillment_status === 'delivered';

            await supabase
              .from('orders')
              .update({
                financial_status: financialStatus,
                ...(alreadyShipped ? {} : { fulfillment_status: 'unfulfilled' as const }),
                // Do NOT reset rx_status — it is owned by the review pipeline and
                // a cancelled order's review history is still a compliance record.
                // The lab-job deletion below stops in-flight work; the reminder
                // cron only targets 'awaiting_upload' so it won't re-arm.
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
      case 'customers/data_request': {
        // Mandatory GDPR topic. We don't auto-export PII; record the request so
        // an operator can fulfil it within the legal window (the webhook_events
        // row is the durable trace; surface it via an audit_log entry too).
        const shopifyCustomerId = (payload as { customer?: { id?: number } }).customer?.id ?? null;
        await supabase.from('audit_log').insert({
          user_id: null,
          action: 'gdpr_data_request',
          entity_type: 'customers',
          entity_id: null,
          after_data: { shopify_customer_id: shopifyCustomerId } as unknown as Json,
        });
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
