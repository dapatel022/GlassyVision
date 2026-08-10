import type { SupabaseClient } from '@supabase/supabase-js';
import { createRedemptionFulfillmentOrder } from '@/features/subscriptions/redemption-order';
import { pairRedemptionLensConfig, type PairConfig } from '@/features/subscriptions/lib/pair-config';
import { isDispensableDestination } from '@/lib/rx/market';
import { sendEmail } from '@/lib/email/resend';
import { renderPairFallback } from '@/lib/email/templates/pair-fallback';

export interface AutoRedeemContext {
  membershipId: string;
  orderId: string;
  customerId: string | null;
  customerEmail: string | null;
  currency: string | null;
  shipTo: Record<string, unknown> | null;
}

/**
 * Server-side redemption of purchase-time configured pairs, run from webhook
 * provisioning. Mirrors startRedemption's claim → reserve → synthesize steps
 * WITHOUT its auth/IDOR layer (the paid order is the authorization) and
 * WITHOUT the surcharge fork (upgrades were paid in the membership order).
 *
 * FAIL-SAFE PER PAIR: any failure reverts that pair to an open slot, releases
 * any inventory unit it reserved, writes an audit_log row, and continues — a
 * membership always provisions fully. Nothing ever throws out of this
 * function for a single bad pair.
 *
 * IDEMPOTENCY CONTRACT: this function is NOT idempotent on its own. Calling
 * it twice for the same membership will claim and attempt to redeem a SECOND
 * batch of slots rather than detect "already ran" — there is no dedupe key
 * here. It must be invoked exactly once per successful membership
 * provisioning call; the caller's uniqueness guard
 * (`subscription_memberships.shopify_order_id` is unique) is what prevents
 * provisioning — and therefore this function — from ever running twice for
 * the same paid order.
 */
export async function autoRedeemConfiguredPairs(
  configs: PairConfig[],
  ctx: AutoRedeemContext,
  supabase: SupabaseClient,
): Promise<{ redeemed: number; fallbacks: number }> {
  let redeemed = 0;
  let fallbacks = 0;

  // Raw audit_log insert. Failure is logged, never thrown — an audit write
  // failing must not itself break the batch.
  const insertAudit = async (
    pairIndex: number,
    config: PairConfig,
    reason: string,
    extra?: Record<string, unknown>,
  ): Promise<void> => {
    const { error } = await supabase.from('audit_log').insert({
      user_id: null,
      action: 'auto_redeem_pair_failed',
      entity_type: 'subscription_memberships',
      entity_id: ctx.membershipId,
      after_data: {
        order_id: ctx.orderId,
        pair_index: pairIndex,
        frame_variant_id: config.v,
        handle: config.h,
        reason,
        ...extra,
      } as never,
    });
    if (error) console.error('[auto-redeem] audit insert failed', error);
  };

  // A true fallback: the pair did not redeem and its slot is (or should now
  // be) back to `available`. Counted toward `fallbacks` and the summary email.
  const auditFallback = (
    pairIndex: number,
    config: PairConfig,
    reason: string,
    extra?: Record<string, unknown>,
  ): Promise<void> => {
    fallbacks += 1;
    return insertAudit(pairIndex, config, reason, extra);
  };

  // An anomaly that is NOT a normal "picked a new frame" fallback — e.g. a DB
  // write that failed after the pair's outcome was already decided, leaving
  // the slot stuck in an unexpected state. Logged loudly for manual triage,
  // but does not change the reported counts or trigger the fallback email
  // (the slot is not actually back to `available`, so that copy would lie).
  const auditAnomaly = (
    pairIndex: number,
    config: PairConfig,
    reason: string,
    extra?: Record<string, unknown>,
  ): Promise<void> => insertAudit(pairIndex, config, reason, extra);

  // Revert a claimed slot to `available`, clearing all per-pick config so no
  // stale prescription/ship-to PII remains — mirrors startRedemption's revert
  // exactly (status available, frame_variant_id null, expected_surcharge 0,
  // is_premium false, lens_config {}, ship_to null). Checks the write's error:
  // a failed revert leaves the slot stuck `locked` with live PII, which must
  // be loud (an audited anomaly), not silently swallowed.
  const revertSlot = async (slotId: string, pairIndex: number, config: PairConfig): Promise<void> => {
    const { error } = await supabase
      .from('subscription_redemptions')
      .update({
        status: 'available',
        frame_variant_id: null,
        expected_surcharge: 0,
        is_premium: false,
        lens_config: {} as never,
        ship_to: null,
      })
      .eq('id', slotId);
    if (error) {
      console.error('[auto-redeem] slot revert failed — slot stuck locked', { slotId, error });
      await auditAnomaly(pairIndex, config, 'status_update_failed', { slot_id: slotId });
    }
  };

  // Release a reserved unit back to the pool. Mirrors sweepAbandonedRedemptions
  // / releaseReservedSlots / handle-refund's convention exactly: same RPC, same
  // `subscription_release` adjustment reason. Self-contained: `release_inventory_unit`
  // is a blind `pool_quantity + 1` (00032_inventory_atomic.sql), so a caller
  // that retries after a lost response would over-credit the pool with a
  // phantom unit. Wrapping the RPC call itself in try/catch guarantees this
  // function NEVER throws — callers must still set `reserved = false` BEFORE
  // awaiting it (not after) so a throw mid-call can't be misread as "still
  // reserved" and trigger a second release.
  const releaseReservation = async (variantId: number, slotId: string, note: string): Promise<void> => {
    try {
      const { error } = await supabase.rpc('release_inventory_unit', {
        p_variant_id: variantId,
        p_reason: 'subscription_release',
        p_redemption_id: slotId,
        p_notes: note,
      });
      if (error) console.error('[auto-redeem] inventory release failed', error);
    } catch (err) {
      console.error('[auto-redeem] inventory release threw', err);
    }
  };

  // Destination gate up front: Rx/eyewear dispensing is US/CA only. A bad
  // destination fails EVERY pair closed (slots remain open, membership stands).
  if (!ctx.shipTo || !isDispensableDestination(ctx.shipTo, null)) {
    for (let i = 0; i < configs.length; i++) await auditFallback(i + 1, configs[i], 'destination_not_dispensable');
    await maybeSendFallbackEmail(ctx, fallbacks, supabase);
    return { redeemed: 0, fallbacks };
  }

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const pairIndex = i + 1;
    let claimedSlotId: string | null = null;
    let reserved = false;
    let orderId: string | null = null;
    try {
      // 1. Lowest-index available slot for this membership.
      const { data: slots, error: selectErr } = await supabase
        .from('subscription_redemptions')
        .select('id, slot_index, status')
        .eq('membership_id', ctx.membershipId)
        .eq('status', 'available')
        .order('slot_index', { ascending: true })
        .limit(1);
      if (selectErr) {
        await auditFallback(pairIndex, config, `no_available_slot: ${selectErr.message}`);
        continue;
      }
      const slot = (slots ?? [])[0] as { id: string } | undefined;
      if (!slot) {
        await auditFallback(pairIndex, config, 'no_available_slot');
        continue;
      }

      // 2. Frame metadata: the premium flag (record-keeping only — the
      // surcharge was already paid at checkout) AND Rx-capability, which
      // gates the compliance check right below. This read is now
      // compliance-load-bearing (its failure mode feeds the Rx gate), so a
      // transient DB error must be its own honest reason — NOT silently
      // treated as "not Rx-capable" (which would wrongly fail every Rx pair
      // with a misleading `frame_not_rx_capable` and tell the customer their
      // fine frame sold out).
      const { data: meta, error: metaErr } = await supabase
        .from('product_metadata')
        .select('subscription_tier, is_rx_capable')
        .eq('shopify_variant_id', config.v)
        .maybeSingle();
      if (metaErr) {
        await auditFallback(pairIndex, config, `frame_metadata_unavailable: ${metaErr.message}`);
        continue;
      }
      const metaRow = meta as { subscription_tier?: string | null; is_rx_capable?: boolean | null } | null;
      const isPremium = metaRow?.subscription_tier === 'premium';
      const isRxCapable = metaRow?.is_rx_capable === true;

      // COMPLIANCE GATE — an Rx-intent pair (anything other than 'non_rx')
      // configured against a frame the catalog has NOT marked Rx-capable must
      // fail CLOSED before a slot is even claimed. Never silently route a
      // prescription pick through the non-Rx (no-Rx-ever-collected) pipeline —
      // `createRedemptionFulfillmentOrder` derives its own hasRxItems from
      // this same is_rx_capable flag, so trusting it blindly here would let a
      // stale/missing metafield sync ship a plano lens for a customer who
      // asked for single_vision, with no Rx ever requested.
      if (config.l !== 'non_rx' && !isRxCapable) {
        await auditFallback(pairIndex, config, 'frame_not_rx_capable');
        continue;
      }

      const lensConfig = pairRedemptionLensConfig(config);

      // 3. Atomic claim (same conditional update as startRedemption).
      const { data: claimed, error: claimErr } = await supabase
        .from('subscription_redemptions')
        .update({
          status: 'locked',
          frame_variant_id: config.v,
          lens_config: lensConfig as never,
          ship_to: ctx.shipTo as never,
          expected_surcharge: 0,
          is_premium: isPremium,
        })
        .eq('id', slot.id)
        .eq('status', 'available')
        .select('id');
      if (claimErr) {
        await auditFallback(pairIndex, config, `slot_claim_race: ${claimErr.message}`);
        continue;
      }
      if (!claimed || claimed.length === 0) {
        await auditFallback(pairIndex, config, 'slot_claim_race');
        continue;
      }
      claimedSlotId = slot.id;

      // 4. Atomic inventory reserve; out-of-stock reverts the slot.
      const { data: reservedPoolId, error: reserveErr } = await supabase.rpc('reserve_inventory_unit', {
        p_variant_id: config.v,
        p_reason: 'subscription_reserved',
        p_redemption_id: slot.id,
        p_notes: `Purchase-time configuration for membership ${ctx.membershipId}`,
      });
      if (reserveErr || !reservedPoolId) {
        await revertSlot(slot.id, pairIndex, config);
        claimedSlotId = null;
        await auditFallback(pairIndex, config, 'out_of_stock');
        continue;
      }
      reserved = true;

      // 5. Synthesized fulfillment order → existing Rx → review → lab pipeline.
      const created = await createRedemptionFulfillmentOrder(
        {
          id: slot.id,
          frame_variant_id: config.v,
          lens_config: lensConfig,
          ship_to: ctx.shipTo,
          membership: { customer_id: ctx.customerId, customer_email: ctx.customerEmail, currency: ctx.currency },
        },
        supabase,
      );
      orderId = created.orderId;
      const { lineItemId, hasRxItems } = created;

      // COMPLIANCE GATE (post-check) — an Rx-intent pair must NEVER be allowed
      // to land in `awaiting_fulfillment` (the no-Rx-ever-collected path), even
      // though it already cleared the pre-claim gate above. This catches a
      // stale/inconsistent product_metadata row (is_rx_capable said yes, but
      // the synthesized order's own is_rx_capable read said no) rather than
      // trusting the earlier read. Fail closed: release the unit this pair
      // just reserved, revert the slot, audit — the synthesized order is left
      // in place (harmless, zero-dollar, never pushed to Shopify) and its id
      // is recorded so it's traceable, not an orphan.
      if (config.l !== 'non_rx' && !hasRxItems) {
        reserved = false;
        await releaseReservation(
          config.v,
          slot.id,
          `Released after rx_routing_mismatch guard (membership ${ctx.membershipId})`,
        );
        await revertSlot(slot.id, pairIndex, config);
        claimedSlotId = null;
        await auditFallback(pairIndex, config, 'rx_routing_mismatch', { synthesized_order_id: orderId });
        continue;
      }

      // 6. Persist the outcome. A failed write here leaves the slot stuck
      // `locked` with a live synthesized order + reserved unit + PII — that
      // must be loud (an audited anomaly), and is NOT counted as redeemed
      // since the local state never actually committed the transition.
      const { error: statusErr } = await supabase
        .from('subscription_redemptions')
        .update({
          status: hasRxItems ? 'awaiting_rx' : 'awaiting_fulfillment',
          internal_order_id: orderId,
          internal_line_item_id: lineItemId,
          redeemed_at: new Date().toISOString(),
        })
        .eq('id', slot.id);
      if (statusErr) {
        console.error('[auto-redeem] status update failed — slot stuck locked', {
          slotId: slot.id,
          orderId,
          error: statusErr,
        });
        await auditAnomaly(pairIndex, config, 'status_update_failed', { slot_id: slot.id, synthesized_order_id: orderId });
        continue;
      }
      redeemed += 1;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown_error';
      // Return any reservation THIS pair holds BEFORE reverting the slot —
      // every other revert path in this codebase (sweep-abandoned,
      // release-reserved-slots, handle-refund) pairs the reset with a release;
      // skipping it here would leak a unit of stock permanently.
      try {
        if (reserved && claimedSlotId) {
          const slotIdToRelease = claimedSlotId;
          reserved = false;
          await releaseReservation(
            config.v,
            slotIdToRelease,
            `Released after auto-redeem pair failure (membership ${ctx.membershipId})`,
          );
        }
        if (claimedSlotId) await revertSlot(claimedSlotId, pairIndex, config);
      } catch (cleanupErr) {
        console.error('[auto-redeem] pair cleanup after failure itself failed', cleanupErr);
      }
      await auditFallback(pairIndex, config, reason, orderId ? { synthesized_order_id: orderId } : undefined);
    }
  }

  await maybeSendFallbackEmail(ctx, fallbacks, supabase);
  return { redeemed, fallbacks };
}

/** Best-effort, comm-deduped on (type, membership) like provisioning's emails. */
async function maybeSendFallbackEmail(ctx: AutoRedeemContext, fallbacks: number, supabase: SupabaseClient): Promise<void> {
  if (fallbacks === 0 || !ctx.customerEmail) return;
  try {
    const { data: prior } = await supabase
      .from('communications')
      .select('metadata, status')
      .eq('type', 'pair_fallback')
      .eq('direction', 'outbound');
    const already = ((prior ?? []) as Array<{ metadata: unknown; status: string }>).some(
      (c) => c.status !== 'failed' && (c.metadata as { membership_id?: string } | null)?.membership_id === ctx.membershipId,
    );
    if (already) return;
    const { data: claimed, error: insertErr } = await supabase
      .from('communications')
      .insert({
        order_id: null, customer_email: ctx.customerEmail, type: 'pair_fallback',
        direction: 'outbound', channel: 'email', provider: 'resend',
        subject: 'Action needed: pick a new frame for your membership pair',
        status: 'queued', metadata: { membership_id: ctx.membershipId },
      })
      .select('id')
      .single();
    if (insertErr) {
      // `pair_fallback` must exist in the comm_type enum (see migration
      // 00047_pair_fallback_comm_type.sql) — if it doesn't, or any other
      // insert failure occurs, this must be loud, not a silent no-send.
      console.error('[auto-redeem] fallback email comm insert failed', insertErr);
      return;
    }
    if (!claimed) return;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://glassyvision.com';
    const rendered = renderPairFallback({ memberName: 'there', manageUrl: `${baseUrl}/account/subscription`, count: fallbacks });
    const result = await sendEmail({ to: ctx.customerEmail, subject: rendered.subject, html: rendered.html, text: rendered.text });
    await supabase
      .from('communications')
      .update(result.success ? { status: 'sent', sent_at: new Date().toISOString(), provider_message_id: result.providerMessageId } : { status: 'failed' })
      .eq('id', (claimed as { id: string }).id);
  } catch (err) {
    console.error('[auto-redeem] fallback email failed (non-gating)', err);
  }
}
