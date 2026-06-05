'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isAdminRole } from '@/lib/auth/middleware';
import { calculateRefund, createRefund } from '@/lib/commerce/shopify-admin';
import { computeProRataRefund } from '@/features/subscriptions/lib/refund-math';
import type { Json } from '@/lib/supabase/types';

/** Slots not yet committed to fulfillment — the only ones a cancel may expire. */
const UNCOMMITTED_STATUSES = ['available', 'locked', 'pending_payment'] as const;

export interface CancelMembershipInput {
  membershipId: string;
  reason: string;
}

export interface CancelMembershipResult {
  success: boolean;
  error?: string;
  /** Pro-rata amount refunded (0 if nothing was refundable). */
  refundAmount?: number;
}

/**
 * Admin-only mid-term cancellation with a pro-rata refund of unredeemed pairs
 * (spec §4.5). Mirrors `reviewRx`'s guard + audit pattern.
 *
 * Flow:
 *  1. Auth: `getCurrentUser` + `isAdminRole` (founder/reviewer).
 *  2. Idempotent: only acts when status ∈ {active, grace}; otherwise no-op success.
 *  3. Compute pro-rata refund from Shopify's actual refundable (never a mirrored
 *     `plan.price`) × (uncommitted / pairs_total); issue via the fixed
 *     calculate-then-refund `createRefund`.
 *  4. Expire uncommitted slots; committed slots run to completion.
 *  5. Set membership `cancelled` + `cancelled_at`/`cancel_reason`. The DB guard
 *     trigger blocks the terminal transition while any slot is committed — that
 *     error is surfaced to the admin (refund already issued; admin retries once
 *     the committed slot completes).
 *  6. Write an `audit_log` row.
 */
export async function cancelMembership(
  input: CancelMembershipInput,
): Promise<CancelMembershipResult> {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return { success: false, error: 'Forbidden' };
  }

  const supabase = createAdminClient();

  const { data: membership, error: memErr } = await supabase
    .from('subscription_memberships')
    .select('id, status, shopify_order_id, currency, pairs_total')
    .eq('id', input.membershipId)
    .maybeSingle();

  if (memErr || !membership) {
    return { success: false, error: 'Membership not found' };
  }
  const mem = membership as {
    id: string;
    status: string;
    shopify_order_id: number;
    currency: string;
    pairs_total: number;
  };

  // Idempotency: only an active, in-grace, or disputed membership can be
  // cancelled. `disputed` is included so a lost chargeback (or a dispute the
  // admin chooses to settle with a refund) has an exit from the otherwise
  // dead-end disputed state.
  if (mem.status !== 'active' && mem.status !== 'grace' && mem.status !== 'disputed') {
    return { success: true, refundAmount: 0 };
  }

  // Count uncommitted slots (the refundable fraction).
  const { data: redemptions } = await supabase
    .from('subscription_redemptions')
    .select('status')
    .eq('membership_id', mem.id);
  const uncommittedCount = ((redemptions ?? []) as Array<{ status: string }>).filter((r) =>
    (UNCOMMITTED_STATUSES as readonly string[]).includes(r.status),
  ).length;

  // Pull the actual refundable amount from Shopify (captured minus already
  // refunded) — never derive money from a mirrored price.
  let capturedAmount = 0;
  try {
    const calc = await calculateRefund(mem.shopify_order_id, 0, mem.currency);
    const suggested =
      calc.refund.transactions.find((t) => t.kind === 'suggested_refund') ??
      calc.refund.transactions[0];
    capturedAmount = suggested ? parseFloat(suggested.amount) : 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return { success: false, error: `Could not read refundable amount from Shopify: ${message}` };
  }

  const refundAmount = computeProRataRefund({
    capturedAmount,
    pairsTotal: mem.pairs_total,
    uncommittedCount,
  });

  if (refundAmount > 0) {
    try {
      await createRefund(
        mem.shopify_order_id,
        refundAmount,
        mem.currency,
        `Admin cancellation pro-rata refund (${uncommittedCount} unredeemed pair(s)) — membership ${mem.id}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      return { success: false, error: `Refund failed: ${message}` };
    }
  }

  // Expire uncommitted slots (committed ones run to completion).
  await supabase
    .from('subscription_redemptions')
    .update({ status: 'expired' })
    .eq('membership_id', mem.id)
    .in('status', [...UNCOMMITTED_STATUSES]);

  // Set the membership cancelled. The guard trigger blocks this while a slot is
  // committed — surface that to the admin (the refund already went out).
  const { error: cancelErr } = await supabase
    .from('subscription_memberships')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: input.reason,
    })
    .eq('id', mem.id);

  if (cancelErr) {
    return {
      success: false,
      error: `Refund issued but cancellation blocked: ${cancelErr.message}`,
      refundAmount,
    };
  }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'membership_cancelled',
    entity_type: 'subscription_membership',
    entity_id: mem.id,
    before_data: { status: mem.status } as unknown as Json,
    after_data: {
      status: 'cancelled',
      cancel_reason: input.reason,
      refund_amount: refundAmount,
      uncommitted_slots_expired: uncommittedCount,
    } as unknown as Json,
  });
  if (auditErr) {
    console.error('[cancel-membership] audit_log insert failed', {
      membershipId: mem.id,
      error: auditErr,
    });
  }

  return { success: true, refundAmount };
}
