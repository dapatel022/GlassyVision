import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/resend';
import { getCapturedAmount, createRefund } from '@/lib/commerce/shopify-admin';
import { applyEndOfTerm } from '@/features/subscriptions/lib/end-of-term';
import type {
  EndOfTermMembership,
  EndOfTermPolicy,
} from '@/features/subscriptions/lib/end-of-term';
import { releaseReservedSlots } from '@/features/subscriptions/lib/release-reserved-slots';
import { renderExpiryWarning } from '@/lib/email/templates/expiry-warning';
import { renderRenewalOffer } from '@/lib/email/templates/renewal-offer';
import type { Database, Json } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

/** Slots not yet committed to fulfillment — the only ones the engine may expire. */
const UNCOMMITTED_STATUSES = ['available', 'locked', 'pending_payment'] as const;
const COMMITTED_STATUSES = ['awaiting_rx', 'in_review', 'in_production', 'shipped'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_GRACE_DAYS = 14;

interface CronError {
  membershipId: string;
  error: string;
}

interface MembershipRow {
  id: string;
  status: string;
  customer_id: string | null;
  shopify_order_id: number;
  currency: string;
  pairs_total: number;
  term_start: string;
  term_end: string;
  rollover_count: number;
  grace_start: string | null;
  end_of_term_policy: EndOfTermPolicy;
}

/**
 * Term length in whole months, derived from the membership's frozen
 * `term_start`/`term_end` span. `term_months` lives on the plan template, not the
 * membership row; the span is the per-membership frozen equivalent and is what a
 * one-time rollover should extend by.
 */
function termMonths(termStart: string, termEnd: string): number {
  const a = new Date(termStart);
  const b = new Date(termEnd);
  const months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  return months > 0 ? months : 12;
}

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const got = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Pick the reminder window that has just been crossed. `reminder_days` are
 * "warn N days before term_end" thresholds (e.g. [60,30,7]). At `daysUntil` days
 * remaining, the tightest crossed-but-unsent threshold is the SMALLEST `d` with
 * `d >= daysUntil`: at 45 days out only the 60 window has been crossed → 60; at
 * 30 days out → 30. Returns null when nothing new is due. Each window fires once
 * (deduped on `sentDays`).
 */
function selectReminderDay(
  daysUntilTermEnd: number,
  reminderDays: number[],
  sentDays: number[],
): number | null {
  if (daysUntilTermEnd < 0) return null;
  // The tightest crossed threshold is the smallest `d >= daysUntil`. We only
  // ever consider that one window: if it has already been sent we return null
  // rather than falling back to a wider window (which would have fired earlier),
  // so a single cron tick never double-warns.
  const tightest = [...reminderDays]
    .sort((x, y) => x - y)
    .find((d) => daysUntilTermEnd <= d);
  if (tightest === undefined) return null;
  return sentDays.includes(tightest) ? null : tightest;
}

/**
 * Fetch the order's ORIGINAL captured amount (sum of success capture/sale
 * transactions) from Shopify so the pro-rata BASE is not understated by a prior
 * partial refund. The remaining refundable still caps the issued amount inside
 * `createRefund`. Never derive money from a mirrored price.
 */
async function fetchCapturedAmount(shopifyOrderId: number, currency: string): Promise<number> {
  try {
    return await getCapturedAmount(shopifyOrderId, currency);
  } catch {
    return 0;
  }
}

/**
 * Daily membership lifecycle cron:
 *  - Reminder phase: for `active` memberships with `term_end` inside a
 *    `reminder_days` window, send `expiry_warning` (once per (membership, day)).
 *  - Transition phase: `active → grace` at `term_end`; apply `end_of_term_policy`
 *    at `term_end + grace_days`.
 *  - Invariant: never drive a membership to a terminal state while any slot is
 *    committed (DB trigger enforces; we also pre-check to avoid a noisy raise).
 */
export async function GET(request: Request): Promise<Response> {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://glassyvision.com';
  const now = Date.now();

  const { data: memberships, error: memErr } = await supabase
    .from('subscription_memberships')
    .select(
      'id, status, customer_id, shopify_order_id, currency, pairs_total, term_start, term_end, rollover_count, grace_start, end_of_term_policy',
    )
    .in('status', ['active', 'grace']);

  if (memErr) {
    console.error('[membership-expiry] membership query failed', memErr);
    return NextResponse.json({ error: 'query failed', detail: memErr.message }, { status: 500 });
  }

  let warned = 0;
  let graced = 0;
  let ended = 0;
  let skipped = 0;
  const errors: CronError[] = [];

  for (const m of (memberships ?? []) as unknown as MembershipRow[]) {
    try {
      const policy: EndOfTermPolicy = m.end_of_term_policy ?? { mode: 'expire' };
      const graceDays = policy.grace_days ?? DEFAULT_GRACE_DAYS;
      const reminderDays = policy.reminder_days ?? [];
      const termEnd = new Date(m.term_end).getTime();

      // Count slot commitments.
      const { data: redemptions } = await supabase
        .from('subscription_redemptions')
        .select('status')
        .eq('membership_id', m.id);
      const statuses = ((redemptions ?? []) as Array<{ status: string }>).map((r) => r.status);
      const uncommittedCount = statuses.filter((s) =>
        (UNCOMMITTED_STATUSES as readonly string[]).includes(s),
      ).length;
      const hasCommitted = statuses.some((s) =>
        (COMMITTED_STATUSES as readonly string[]).includes(s),
      );

      // --- Transition: end-of-term (grace expired) ---
      if (now >= termEnd + graceDays * DAY_MS) {
        if (hasCommitted) {
          // A committed slot is still being fulfilled; defer until it completes.
          skipped++;
          continue;
        }
        const capturedAmount =
          policy.mode === 'refund'
            ? await fetchCapturedAmount(m.shopify_order_id, m.currency)
            : 0;
        const eotMembership: EndOfTermMembership = {
          id: m.id,
          status: m.status,
          shopify_order_id: m.shopify_order_id,
          currency: m.currency,
          pairs_total: m.pairs_total,
          term_end: m.term_end,
          term_months: termMonths(m.term_start, m.term_end),
          rollover_count: m.rollover_count,
          end_of_term_policy: policy,
        };
        let result;
        try {
          result = await applyEndOfTerm({
            membership: eotMembership,
            uncommittedCount,
            deps: {
              now: () => new Date(now),
              capturedAmount,
              expireUncommittedSlots: async (membershipId) => {
                // Release inventory reserved by pending_payment slots BEFORE
                // expiring them, or the reserved frame unit is stranded.
                await releaseReservedSlots(supabase, membershipId);
                await supabase
                  .from('subscription_redemptions')
                  .update({ status: 'expired' })
                  .eq('membership_id', membershipId)
                  .in('status', [...UNCOMMITTED_STATUSES]);
              },
              setMembership: async (membershipId, patch) => {
                const { error } = await supabase
                  .from('subscription_memberships')
                  .update(patch as Database['public']['Tables']['subscription_memberships']['Update'])
                  .eq('id', membershipId);
                return { error };
              },
              createRefund,
            },
          });
        } catch (err) {
          // applyEndOfTerm surfaces a guard-trigger raise on the terminal
          // membership update (a slot raced into a committed state). Record it as
          // an error — do NOT count this as a successful end-of-term.
          const message = err instanceof Error ? err.message : 'unknown';
          errors.push({ membershipId: m.id, error: `end-of-term: ${message}` });
          continue;
        }
        ended++;

        // Renewal offer on a terminal (non-rollover) end-of-term.
        if (result.mode !== 'rollover') {
          await maybeSendLifecycle(supabase, m, 'renewal_offer', null, baseUrl, errors);
        }
        continue;
      }

      // --- Transition: active → grace at term_end ---
      if (m.status === 'active' && now >= termEnd) {
        await supabase
          .from('subscription_memberships')
          .update({ status: 'grace', grace_start: new Date(now).toISOString() })
          .eq('id', m.id);
        graced++;
        continue;
      }

      // --- Reminder phase: active membership approaching term_end ---
      if (m.status === 'active' && reminderDays.length > 0) {
        const daysUntil = Math.ceil((termEnd - now) / DAY_MS);
        const { data: priorComms } = await supabase
          .from('communications')
          .select('metadata, status')
          .eq('type', 'expiry_warning')
          .eq('direction', 'outbound');
        const sentDays = ((priorComms ?? []) as Array<{ metadata: unknown; status: string }>)
          .filter((c) => c.status !== 'failed')
          .filter((c) => (c.metadata as { membership_id?: string } | null)?.membership_id === m.id)
          .map((c) => Number((c.metadata as { reminder_day?: number } | null)?.reminder_day))
          .filter((n) => Number.isFinite(n));

        const day = selectReminderDay(daysUntil, reminderDays, sentDays);
        if (day !== null) {
          const rendered = renderExpiryWarning({
            daysLeft: Math.max(daysUntil, 0),
            manageUrl: `${baseUrl}/account/subscription`,
          });
          const sentOk = await sendLifecycleEmail(
            supabase,
            m,
            'expiry_warning',
            day,
            rendered,
            errors,
          );
          if (sentOk) warned++;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      console.error('[membership-expiry] iteration crashed', { membershipId: m.id, error: message });
      errors.push({ membershipId: m.id, error: `crash: ${message}` });
    }
  }

  const hasErrors = errors.length > 0;
  if (hasErrors) {
    console.error('[membership-expiry] completed with errors', { warned, graced, ended, skipped, errors });
  }
  return NextResponse.json(
    { success: !hasErrors, warned, graced, ended, skipped, errors },
    { status: hasErrors ? 500 : 200 },
  );
}

/**
 * Resolve the membership's customer email, then send a one-shot lifecycle email
 * (renewal_offer) deduped by membership id (no reminder_day key).
 */
async function maybeSendLifecycle(
  supabase: ReturnType<typeof createAdminClient>,
  m: MembershipRow,
  type: 'renewal_offer',
  _day: number | null,
  baseUrl: string,
  errors: CronError[],
): Promise<void> {
  const { data: prior } = await supabase
    .from('communications')
    .select('metadata, status')
    .eq('type', type)
    .eq('direction', 'outbound');
  const already = ((prior ?? []) as Array<{ metadata: unknown; status: string }>).some(
    (c) =>
      c.status !== 'failed' &&
      (c.metadata as { membership_id?: string } | null)?.membership_id === m.id,
  );
  if (already) return;
  const rendered = renderRenewalOffer({ renewUrl: `${baseUrl}/account/subscription` });
  await sendLifecycleEmail(supabase, m, type, null, rendered, errors);
}

/**
 * Pre-claim a `communications` row, send the email, then mark sent/failed.
 * Returns true on a successful send. Dedupe is best-effort via a prior read in
 * the caller; the pre-claim row carries `membership_id` so a re-run sees it.
 */
async function sendLifecycleEmail(
  supabase: ReturnType<typeof createAdminClient>,
  m: MembershipRow,
  type: 'expiry_warning' | 'renewal_offer',
  reminderDay: number | null,
  rendered: { subject: string; html: string; text: string },
  errors: CronError[],
): Promise<boolean> {
  if (!m.customer_id) return false;
  const { data: cust } = await supabase
    .from('customers')
    .select('email')
    .eq('id', m.customer_id)
    .maybeSingle();
  const email = (cust as { email?: string } | null)?.email;
  if (!email) return false;

  const metadata: Record<string, unknown> = { membership_id: m.id };
  if (reminderDay !== null) metadata.reminder_day = reminderDay;

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
      metadata: metadata as Json,
    })
    .select('id')
    .single();

  if (claimError || !claimed) {
    errors.push({ membershipId: m.id, error: `claim ${type}: ${claimError?.message ?? 'no row'}` });
    return false;
  }

  const sendResult = await sendEmail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (sendResult.success) {
    await supabase
      .from('communications')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider_message_id: sendResult.providerMessageId,
      })
      .eq('id', (claimed as { id: string }).id);
    return true;
  }

  await supabase
    .from('communications')
    .update({ status: 'failed', metadata: { ...metadata, failed_error: sendResult.error } as Json })
    .eq('id', (claimed as { id: string }).id);
  errors.push({ membershipId: m.id, error: `send ${type}: ${sendResult.error}` });
  return false;
}
