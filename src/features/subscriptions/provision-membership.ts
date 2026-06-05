import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email/resend';
import { renderMembershipWelcome } from '@/lib/email/templates/membership-welcome';
import { renderSlotUnlocked } from '@/lib/email/templates/slot-unlocked';

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
      // Settlement currency from the membership purchase — carried onto every
      // redemption's synthesized fulfillment order so USD vs CAD is correct.
      currency: (order.currency ?? 'usd').toLowerCase() === 'cad' ? 'cad' : 'usd',
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

  // Best-effort lifecycle emails. NEVER gate provisioning on a mail failure —
  // the membership + slots are already persisted. Each send is idempotent via a
  // prior-comm read keyed on (type, metadata.membership_id) so a webhook
  // re-delivery (orders/paid + orders/updated) does not double-send.
  try {
    await sendProvisioningEmails(order, membership.id, plan.pairs_count, allImmediate, supabase);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[provision-membership] lifecycle email send failed (non-gating)', {
      membershipId: membership.id,
      error: message,
    });
  }

  return { provisioned: true, membershipId: membership.id };
}

/**
 * Send the `membership_welcome` and (for all-immediate plans) `slot_unlocked`
 * emails on provisioning. Idempotent: a prior non-failed comm of the same type
 * for this membership short-circuits the send. Mirrors the cron's best-effort
 * pre-claim → send → mark pattern, deduped by `metadata.membership_id`.
 */
async function sendProvisioningEmails(
  order: OrderRow,
  membershipId: string,
  pairsTotal: number,
  allImmediate: boolean,
  supabase: SupabaseClient,
): Promise<void> {
  // Resolve recipient + name. Prefer the customer row; fall back to the order's
  // email so a guest checkout still gets the welcome.
  let email = order.customer_email ?? null;
  let firstName = 'there';
  if (order.customer_id) {
    const { data: cust } = await supabase
      .from('customers')
      .select('first_name, email')
      .eq('id', order.customer_id)
      .maybeSingle();
    const c = cust as { first_name?: string | null; email?: string | null } | null;
    if (c?.email) email = c.email;
    if (c?.first_name && c.first_name.trim()) firstName = c.first_name.trim();
  }
  if (!email) return;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://glassyvision.com';
  const manageUrl = `${baseUrl}/account/subscription`;

  const welcome = renderMembershipWelcome({ memberName: firstName, pairsTotal, manageUrl });
  await maybeSendComm(supabase, membershipId, 'membership_welcome', email, welcome);

  if (allImmediate) {
    const slot = renderSlotUnlocked({ memberName: firstName, redeemUrl: manageUrl });
    await maybeSendComm(supabase, membershipId, 'slot_unlocked', email, slot);
  }
}

/**
 * Pre-claim a `communications` row (deduped on type + metadata.membership_id),
 * send the email, then mark sent/failed. No-op when a non-failed comm already
 * exists for this (type, membership).
 */
async function maybeSendComm(
  supabase: SupabaseClient,
  membershipId: string,
  type: 'membership_welcome' | 'slot_unlocked',
  email: string,
  rendered: { subject: string; html: string; text: string },
): Promise<void> {
  const { data: prior } = await supabase
    .from('communications')
    .select('metadata, status')
    .eq('type', type)
    .eq('direction', 'outbound');
  const already = ((prior ?? []) as Array<{ metadata: unknown; status: string }>).some(
    (c) =>
      c.status !== 'failed' &&
      (c.metadata as { membership_id?: string } | null)?.membership_id === membershipId,
  );
  if (already) return;

  const metadata = { membership_id: membershipId };
  const { data: claimed, error: claimError } = await supabase
    .from('communications')
    .insert({
      order_id: null,
      customer_email: email,
      type,
      direction: 'outbound',
      channel: 'email',
      provider: 'resend',
      subject: rendered.subject,
      status: 'queued',
      metadata,
    })
    .select('id')
    .single();
  if (claimError || !claimed) return;

  const result = await sendEmail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (result.success) {
    await supabase
      .from('communications')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider_message_id: result.providerMessageId,
      })
      .eq('id', (claimed as { id: string }).id);
  } else {
    await supabase
      .from('communications')
      .update({ status: 'failed', metadata: { ...metadata, failed_error: result.error } })
      .eq('id', (claimed as { id: string }).id);
  }
}
