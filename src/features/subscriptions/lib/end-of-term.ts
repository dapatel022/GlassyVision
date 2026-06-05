import { computeProRataRefund } from './refund-math';

/** End-of-term policy mode, per-plan, frozen onto the membership. */
export type EndOfTermMode = 'expire' | 'refund' | 'rollover';

/** The frozen end-of-term policy snapshot on a membership. */
export interface EndOfTermPolicy {
  mode: EndOfTermMode;
  reminder_days?: number[];
  grace_days?: number;
}

/** The membership fields the engine reads. */
export interface EndOfTermMembership {
  id: string;
  status: string;
  shopify_order_id: number;
  currency: string;
  pairs_total: number;
  /** ISO timestamp — used to extend on rollover. */
  term_end: string;
  /** Frozen plan term length in months — the rollover extension window. */
  term_months: number;
  rollover_count: number;
  end_of_term_policy: EndOfTermPolicy;
}

/** Side-effecting dependencies, injected so the engine stays unit-testable. */
export interface EndOfTermDeps {
  /** Wall clock (injected for determinism). */
  now: () => Date;
  /** Actual amount captured by Shopify for the membership order, this currency. */
  capturedAmount: number;
  /** Expire all uncommitted (`available`/`locked`/`pending_payment`) slots for a membership. */
  expireUncommittedSlots: (membershipId: string) => Promise<void>;
  /** Patch the membership row (status / term_end / rollover_count / grace fields). */
  setMembership: (membershipId: string, patch: Record<string, unknown>) => Promise<void>;
  /** Issue a refund via the fixed, calculate-then-refund Shopify path. */
  createRefund: (orderId: number, amount: number, currency: string, note: string) => Promise<unknown>;
}

export interface ApplyEndOfTermInput {
  membership: EndOfTermMembership;
  /** Count of slots in {available, locked, pending_payment} at decision time. */
  uncommittedCount: number;
  deps: EndOfTermDeps;
}

export interface ApplyEndOfTermResult {
  mode: EndOfTermMode;
  /** Uncommitted slots expired (expire/refund modes). */
  expired?: number;
  /** Pro-rata refund issued (refund mode). */
  refundAmount?: number;
}

/** Add whole months to an ISO timestamp, preserving the rest of the instant. */
function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

/**
 * Apply a membership's end-of-term policy once the grace window has elapsed.
 *
 * Pure-ish orchestrator: all I/O goes through injected `deps`, so the cron
 * supplies real Supabase/Shopify deps while tests supply spies.
 *
 * Modes (overview spec §4.3):
 *  - `expire`   → uncommitted slots `expired`, membership `expired`. No money.
 *  - `refund`   → pro-rata refund (§4.4) for uncommitted slots, slots `expired`,
 *                 membership `refunded`.
 *  - `rollover` → ONE-TIME term extension (`term_end += term_months`,
 *                 `rollover_count` 0→1, membership stays `active`). A membership
 *                 that has already rolled over once falls back to `expire` so the
 *                 term can never extend forever.
 *
 * The DB guard trigger still enforces that no terminal transition lands while a
 * slot is committed; this engine only ever expires uncommitted slots.
 */
export async function applyEndOfTerm({
  membership,
  uncommittedCount,
  deps,
}: ApplyEndOfTermInput): Promise<ApplyEndOfTermResult> {
  const mode = membership.end_of_term_policy?.mode ?? 'expire';

  // Rollover that hasn't been used yet → extend once, stay active.
  if (mode === 'rollover' && membership.rollover_count < 1) {
    await deps.setMembership(membership.id, {
      status: 'active',
      rollover_count: membership.rollover_count + 1,
      term_end: addMonthsIso(membership.term_end, membership.term_months),
    });
    return { mode: 'rollover' };
  }

  // Refund: pro-rata against captured, then expire + mark refunded.
  if (mode === 'refund') {
    const refundAmount = computeProRataRefund({
      capturedAmount: deps.capturedAmount,
      pairsTotal: membership.pairs_total,
      uncommittedCount,
    });
    if (refundAmount > 0) {
      await deps.createRefund(
        membership.shopify_order_id,
        refundAmount,
        membership.currency,
        `End-of-term pro-rata refund for ${uncommittedCount} unredeemed pair(s) on membership ${membership.id}`,
      );
    }
    await deps.expireUncommittedSlots(membership.id);
    await deps.setMembership(membership.id, { status: 'refunded' });
    return { mode: 'refund', expired: uncommittedCount, refundAmount };
  }

  // Default / rollover-exhausted: plain expire.
  await deps.expireUncommittedSlots(membership.id);
  await deps.setMembership(membership.id, { status: 'expired' });
  return { mode: 'expire', expired: uncommittedCount };
}
