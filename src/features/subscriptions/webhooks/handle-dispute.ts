import type { SupabaseClient } from '@supabase/supabase-js';

/** The slice of a Shopify `disputes/create` payload we rely on. */
export interface DisputeWebhookPayload {
  /** The Shopify order id the chargeback/dispute was opened against. */
  order_id?: number | null;
}

export interface DisputeWebhookResult {
  handled: 'membership' | 'none';
}

/**
 * React to a Shopify `disputes/create` (chargeback) webhook.
 *
 * A dispute against a membership purchase order freezes the membership:
 * `status='disputed'`. Terminal states (and `disputed` itself) already block
 * new redemptions (`startRedemption` requires `status='active'`), so this halts
 * further slot use while the chargeback is contested. NO automatic refund is
 * issued — the resolution is handled manually by an admin on the membership
 * detail page. We write an `audit_log` row so the dispute surfaces for review.
 *
 * Idempotent (a membership already `disputed`/terminal is left untouched) and a
 * safe no-op for non-subscription orders.
 */
export async function handleDisputeWebhook(
  payload: DisputeWebhookPayload,
  supabase: SupabaseClient,
): Promise<DisputeWebhookResult> {
  const orderId = payload.order_id;
  if (orderId == null) return { handled: 'none' };

  const { data: membership } = await supabase
    .from('subscription_memberships')
    .select('id, status')
    .eq('shopify_order_id', orderId)
    .maybeSingle();

  if (!membership) return { handled: 'none' };

  const mem = membership as { id: string; status: string };

  // Idempotency: once disputed (or already in a terminal money state) a
  // re-delivered dispute webhook is a no-op.
  if (['disputed', 'refunded', 'cancelled', 'expired'].includes(mem.status)) {
    return { handled: 'membership' };
  }

  await supabase
    .from('subscription_memberships')
    .update({ status: 'disputed' })
    .eq('id', mem.id);

  // Flag for manual admin review — no automatic refund on a chargeback.
  await supabase.from('audit_log').insert({
    user_id: null,
    action: 'membership_disputed',
    entity_type: 'subscription_membership',
    entity_id: mem.id,
    before_data: { status: mem.status },
    after_data: { status: 'disputed', shopify_order_id: orderId },
  });

  return { handled: 'membership' };
}
