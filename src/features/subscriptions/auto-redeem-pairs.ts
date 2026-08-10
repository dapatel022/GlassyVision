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
 * FAIL-SAFE PER PAIR: any failure reverts that pair to an open slot, writes an
 * audit_log row, and continues — a membership always provisions fully.
 */
export async function autoRedeemConfiguredPairs(
  configs: PairConfig[],
  ctx: AutoRedeemContext,
  supabase: SupabaseClient,
): Promise<{ redeemed: number; fallbacks: number }> {
  let redeemed = 0;
  let fallbacks = 0;

  const audit = async (pairIndex: number, config: PairConfig, reason: string) => {
    fallbacks += 1;
    const { error } = await supabase.from('audit_log').insert({
      user_id: null,
      action: 'auto_redeem_pair_failed',
      entity_type: 'subscription_memberships',
      entity_id: ctx.membershipId,
      after_data: {
        order_id: ctx.orderId, pair_index: pairIndex,
        frame_variant_id: config.v, handle: config.h, reason,
      } as never,
    });
    if (error) console.error('[auto-redeem] audit insert failed', error);
  };

  // Destination gate up front: Rx/eyewear dispensing is US/CA only. A bad
  // destination fails EVERY pair closed (slots remain open, membership stands).
  if (!ctx.shipTo || !isDispensableDestination(ctx.shipTo, null)) {
    for (let i = 0; i < configs.length; i++) await audit(i + 1, configs[i], 'destination_not_dispensable');
    await maybeSendFallbackEmail(ctx, fallbacks, supabase);
    return { redeemed: 0, fallbacks };
  }

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    let claimedSlotId: string | null = null;
    try {
      // 1. Lowest-index available slot for this membership.
      const { data: slots } = await supabase
        .from('subscription_redemptions')
        .select('id, slot_index, status')
        .eq('membership_id', ctx.membershipId)
        .eq('status', 'available')
        .order('slot_index', { ascending: true })
        .limit(1);
      const slot = (slots ?? [])[0] as { id: string } | undefined;
      if (!slot) { await audit(i + 1, config, 'no_available_slot'); continue; }

      // 2. Premium flag (record-keeping; the surcharge was already paid).
      const { data: meta } = await supabase
        .from('product_metadata')
        .select('subscription_tier')
        .eq('shopify_variant_id', config.v)
        .maybeSingle();
      const isPremium = (meta as { subscription_tier?: string | null } | null)?.subscription_tier === 'premium';

      const lensConfig = pairRedemptionLensConfig(config);

      // 3. Atomic claim (same conditional update as startRedemption).
      const { data: claimed } = await supabase
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
      if (!claimed || claimed.length === 0) { await audit(i + 1, config, 'slot_claim_race'); continue; }
      claimedSlotId = slot.id;

      // 4. Atomic inventory reserve; out-of-stock reverts the slot.
      const { data: reservedPoolId, error: reserveErr } = await supabase.rpc('reserve_inventory_unit', {
        p_variant_id: config.v,
        p_reason: 'subscription_reserved',
        p_redemption_id: slot.id,
        p_notes: `Purchase-time configuration for membership ${ctx.membershipId}`,
      });
      if (reserveErr || !reservedPoolId) {
        await revertSlot(slot.id, supabase);
        claimedSlotId = null;
        await audit(i + 1, config, 'out_of_stock');
        continue;
      }

      // 5. Synthesized fulfillment order → existing Rx → review → lab pipeline.
      const { orderId, lineItemId, hasRxItems } = await createRedemptionFulfillmentOrder(
        {
          id: slot.id,
          frame_variant_id: config.v,
          lens_config: lensConfig,
          ship_to: ctx.shipTo,
          membership: { customer_id: ctx.customerId, customer_email: ctx.customerEmail, currency: ctx.currency },
        },
        supabase,
      );

      await supabase
        .from('subscription_redemptions')
        .update({
          status: hasRxItems ? 'awaiting_rx' : 'awaiting_fulfillment',
          internal_order_id: orderId,
          internal_line_item_id: lineItemId,
          redeemed_at: new Date().toISOString(),
        })
        .eq('id', slot.id);
      redeemed += 1;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown_error';
      if (claimedSlotId) await revertSlot(claimedSlotId, supabase).catch(() => undefined);
      await audit(i + 1, config, reason);
    }
  }

  await maybeSendFallbackEmail(ctx, fallbacks, supabase);
  return { redeemed, fallbacks };
}

/** Mirror startRedemption's revert: clear all per-pick config so no stale PII remains. */
async function revertSlot(slotId: string, supabase: SupabaseClient): Promise<void> {
  await supabase
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
    const { data: claimed } = await supabase
      .from('communications')
      .insert({
        order_id: null, customer_email: ctx.customerEmail, type: 'pair_fallback',
        direction: 'outbound', channel: 'email', provider: 'resend',
        subject: 'Action needed: pick a new frame for your membership pair',
        status: 'queued', metadata: { membership_id: ctx.membershipId },
      })
      .select('id')
      .single();
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
