import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/supabase/types';
import { sendEmail } from '@/lib/email/resend';
import { renderMembershipWelcome } from '@/lib/email/templates/membership-welcome';
import { renderSlotUnlocked } from '@/lib/email/templates/slot-unlocked';
import { validatePairConfigs } from '@/features/subscriptions/lib/pair-config';
import { autoRedeemConfiguredPairs } from '@/features/subscriptions/auto-redeem-pairs';

interface OrderRow {
  id: string;
  shopify_order_id: number | null;
  customer_id: string | null;
  customer_email?: string | null;
  currency?: string | null;
  financial_status: string;
  // Raw jsonb as read off the `orders` row (Shopify's shipping_address REST
  // payload, verbatim). Narrowed to a plain object — or null — right before
  // it is handed to auto-redeem; never trust the DB shape blindly.
  shipping_address?: Json;
}

interface RedemptionPolicy {
  mode?: string;
}

/**
 * Narrow raw `orders.shipping_address` jsonb to the plain-object shape
 * `isDispensableDestination` (and the rest of the auto-redeem path) expects.
 * Anything else — a bare string/number/bool, an array, or null/undefined —
 * becomes `null`, which fails the destination gate closed rather than ever
 * handing a non-object value into auto-redeem.
 */
function asShipToRecord(value: Json | null | undefined): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
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
): Promise<{ provisioned: boolean; membershipId?: string; conflict?: 'active_membership_exists' }> {
  if (order.financial_status !== 'paid') return { provisioned: false };
  // Synthesized (subscription-source) orders have no Shopify id and can never be
  // a membership purchase — skip (also satisfies the NOT NULL unique key).
  if (order.shopify_order_id == null) return { provisioned: false };

  const { data: lineItems } = await supabase
    .from('order_line_items')
    .select('variant_id, product_id, sku, pair_configs')
    .eq('order_id', order.id);
  const { data: plans } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('status', 'active');

  // All tiers share ONE Shopify product, so a product-id match is ambiguous —
  // it would always resolve to the first plan row regardless of the tier
  // bought. Variant id is the tier identity; product id is only a fallback for
  // legacy single-plan setups with no variant id recorded.
  const plan =
    (plans ?? []).find((p) =>
      p.shopify_variant_id && (lineItems ?? []).some((li) => li.variant_id === p.shopify_variant_id),
    ) ??
    (plans ?? []).find((p) =>
      !p.shopify_variant_id && p.shopify_product_id && (lineItems ?? []).some((li) => li.product_id === p.shopify_product_id),
    );
  if (!plan) {
    // A membership SKU with no matching plan row means checkout sold a tier
    // provisioning cannot fulfill — that must be loud, not a silent skip.
    const subSkus = (lineItems ?? []).map((li) => li.sku).filter((s): s is string => !!s && s.startsWith('SUB-'));
    if (subSkus.length > 0) {
      await supabase.from('audit_log').insert({
        user_id: null,
        action: 'membership_provision_failed',
        entity_type: 'orders',
        entity_id: order.id,
        after_data: { skus: subSkus, reason: 'no active subscription_plans row matches the purchased variant' } as never,
      });
    }
    return { provisioned: false };
  }

  const termEnd = new Date();
  termEnd.setMonth(termEnd.getMonth() + plan.term_months);

  // Settlement currency from the membership purchase — carried onto every
  // redemption's synthesized fulfillment order so USD vs CAD is correct.
  const membershipCurrency = (order.currency ?? 'usd').toLowerCase() === 'cad' ? 'cad' : 'usd';

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
      currency: membershipCurrency,
      term_end: termEnd.toISOString(),
      pairs_total: plan.pairs_count,
      redemption_policy: plan.redemption_policy,
      end_of_term_policy: plan.end_of_term_policy,
    })
    .select('id')
    .maybeSingle();

  if (insertErr) {
    if (insertErr.code === '23505') {
      // Two distinct constraints raise 23505 here and they mean opposite things:
      //  - shopify_order_id unique → a duplicate delivery of the SAME order
      //    (benign idempotency).
      //  - idx_one_active_membership_per_customer → a DIFFERENT paid order for a
      //    customer who already has an active/grace membership. That is NOT
      //    idempotency: the customer paid again and would get nothing. Surface it
      //    for an admin (extend term / refund / stack) instead of silently
      //    swallowing the payment.
      const detail = `${insertErr.message ?? ''} ${insertErr.details ?? ''}`;
      if (detail.includes('idx_one_active_membership_per_customer')) {
        const { error: auditErr } = await supabase.from('audit_log').insert({
          user_id: null,
          action: 'membership_provision_conflict',
          entity_type: 'orders',
          entity_id: order.id,
          after_data: {
            reason: 'customer_already_has_active_membership',
            shopify_order_id: order.shopify_order_id,
          },
        });
        if (auditErr) {
          console.error('[provision-membership] conflict audit insert failed', auditErr);
        }
        return { provisioned: false, conflict: 'active_membership_exists' };
      }
      // shopify_order_id idempotency — already provisioned by a prior delivery.
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

  // Purchase-time configured pairs: auto-redeem them through the existing
  // redemption pipeline. Re-validate — DB jsonb is not trusted blindly.
  let openSlots = plan.pairs_count;
  const membershipLine = (lineItems ?? []).find((li) => (li.sku ?? '').startsWith('SUB-')) as
    | { pair_configs?: unknown }
    | undefined;
  if (membershipLine?.pair_configs) {
    const validated = validatePairConfigs(membershipLine.pair_configs, plan.pairs_count);
    if (!validated.ok) {
      await supabase.from('audit_log').insert({
        user_id: null,
        action: 'auto_redeem_configs_invalid',
        entity_type: 'subscription_memberships',
        entity_id: membership.id,
        after_data: { order_id: order.id, reason: validated.error } as never,
      });
    } else if (validated.configs.length > 0) {
      // autoRedeemConfiguredPairs guarantees no throw for a single bad PAIR, but
      // its up-front destination gate and audit inserts sit outside that
      // per-pair try — a throw there must NEVER propagate out of provisioning:
      // the membership + slots are already committed, so an uncaught error here
      // would 5xx the webhook, drop the welcome/slot_unlocked emails, and (since
      // the retry hits the shopify_order_id idempotency short-circuit) lose them
      // permanently. Leave openSlots at its pairs_count default so both emails
      // still go out as if no auto-redeem had been attempted.
      try {
        const { redeemed } = await autoRedeemConfiguredPairs(
          validated.configs,
          {
            membershipId: membership.id,
            orderId: order.id,
            customerId: order.customer_id,
            customerEmail: order.customer_email ?? null,
            currency: membershipCurrency,
            shipTo: asShipToRecord(order.shipping_address),
          },
          supabase,
        );
        openSlots = plan.pairs_count - redeemed;
      } catch (err) {
        console.error('[provision-membership] auto-redeem threw (non-gating)', {
          membershipId: membership.id,
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    }
  }

  // Best-effort lifecycle emails. NEVER gate provisioning on a mail failure —
  // the membership + slots are already persisted. Each send is idempotent via a
  // prior-comm read keyed on (type, metadata.membership_id) so a webhook
  // re-delivery (orders/paid + orders/updated) does not double-send.
  try {
    await sendProvisioningEmails(order, membership.id, plan.pairs_count, allImmediate && openSlots > 0, supabase);
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
