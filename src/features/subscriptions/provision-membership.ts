import type { SupabaseClient } from '@supabase/supabase-js';

interface OrderRow {
  id: string;
  shopify_order_id: number | null;
  customer_id: string | null;
  customer_email?: string | null;
  currency?: string | null;
  financial_status: string;
}

interface RedemptionPolicy {
  mode?: string;
}

/**
 * Provision a subscription membership from a paid Shopify order.
 *
 * Guarantees (compliance/correctness critical):
 *  - **Paid-gated:** only runs when `financial_status === 'paid'`.
 *  - **Idempotent:** keyed on `subscription_memberships.shopify_order_id` (unique).
 *    A duplicate `orders/paid` / `orders/updated` redelivery MUST NOT mint a
 *    second membership. The unique constraint surfaces in two possible ways via
 *    the Supabase JS client on a plain INSERT:
 *      (a) an `error` with `code === '23505'` (unique_violation), or
 *      (b) a `null` data row from `.select().maybeSingle()` (if the insert is
 *          ever rewritten as ON CONFLICT DO NOTHING).
 *    Both are treated as "already provisioned" → `{ provisioned: false }`, and
 *    no redemption slots are (re)created.
 */
export async function provisionMembershipFromOrder(
  order: OrderRow,
  supabase: SupabaseClient,
): Promise<{ provisioned: boolean; membershipId?: string }> {
  if (order.financial_status !== 'paid') return { provisioned: false };
  // Synthesized (subscription-source) orders have no Shopify id and can never be
  // a membership purchase — skip (also satisfies the NOT NULL unique key).
  if (order.shopify_order_id == null) return { provisioned: false };

  const { data: lineItems } = await supabase
    .from('order_line_items')
    .select('variant_id, product_id')
    .eq('order_id', order.id);
  const { data: plans } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('status', 'active');

  const plan = (plans ?? []).find((p) =>
    (lineItems ?? []).some((li) =>
      (p.shopify_variant_id && li.variant_id === p.shopify_variant_id) ||
      (p.shopify_product_id && li.product_id === p.shopify_product_id)),
  );
  if (!plan) return { provisioned: false };

  const termEnd = new Date();
  termEnd.setMonth(termEnd.getMonth() + plan.term_months);

  // Idempotent on shopify_order_id (unique). A duplicate delivery either returns
  // a unique-violation error (23505) or — if rewritten as ON CONFLICT DO NOTHING
  // — a null row; both mean "already provisioned", so do not mint slots again.
  const { data: membership, error: insertErr } = await supabase
    .from('subscription_memberships')
    .insert({
      plan_id: plan.id,
      customer_id: order.customer_id,
      shopify_order_id: order.shopify_order_id,
      status: 'active',
      term_end: termEnd.toISOString(),
      pairs_total: plan.pairs_count,
      redemption_policy: plan.redemption_policy,
      end_of_term_policy: plan.end_of_term_policy,
    })
    .select('id')
    .maybeSingle();

  if (insertErr) {
    if (insertErr.code === '23505') {
      // Already provisioned by a prior (concurrent or earlier) delivery.
      return { provisioned: false };
    }
    // Unexpected DB failure — surface so the webhook returns 5xx and Shopify retries.
    throw new Error(`Failed to provision membership: ${insertErr.message}`);
  }

  if (!membership) return { provisioned: false }; // null row → already provisioned

  const nowIso = new Date().toISOString();
  const redemptionPolicy = (plan.redemption_policy ?? {}) as RedemptionPolicy;
  const allImmediate = (redemptionPolicy.mode ?? 'all_immediate') === 'all_immediate';
  // Pre-materialize one redemption slot per covered pair. With all-immediate the
  // unlock is now; future drip policies would stagger unlocks_at.
  const slots = Array.from({ length: plan.pairs_count }, (_, i) => ({
    membership_id: membership.id,
    slot_index: i,
    status: 'available' as const,
    unlocks_at: allImmediate ? nowIso : nowIso,
  }));
  await supabase.from('subscription_redemptions').insert(slots);

  return { provisioned: true, membershipId: membership.id };
}
