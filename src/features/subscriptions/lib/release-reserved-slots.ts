import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Release the inventory reservations held by a membership's `pending_payment`
 * slots BEFORE they are flipped to `expired`.
 *
 * `startRedemption` reserves a frame unit (decrement `inventory_pool.pool_quantity`
 * + a `-1` `subscription_reserved` adjustment) for a surcharge pick the moment the
 * slot moves to `pending_payment`. The abandoned-checkout sweeper and the add-on
 * refund branch release that reservation when they free such a slot — but the
 * end-of-term / cancel / manual-expire / membership-refund paths previously
 * expired `pending_payment` slots WITHOUT releasing, stranding a reserved unit of
 * stock forever. This helper closes that leak: for every `pending_payment` slot on
 * the membership that still holds a `frame_variant_id`, it writes a `+1`
 * `subscription_release` adjustment and increments the pool, mirroring
 * `sweepAbandonedRedemptions` exactly (same column names / adjustment reason).
 *
 * Call it as part of expiring uncommitted slots, before the slots are set to
 * `expired`. Idempotent in effect: once the slots are `expired` the
 * `pending_payment` filter finds nothing on a re-run.
 */
export async function releaseReservedSlots(
  supabase: SupabaseClient,
  membershipId: string,
): Promise<{ released: number }> {
  const { data: pending } = await supabase
    .from('subscription_redemptions')
    .select('id, frame_variant_id')
    .eq('membership_id', membershipId)
    .eq('status', 'pending_payment')
    .not('frame_variant_id', 'is', null);

  let released = 0;

  for (const slot of (pending ?? []) as Array<{ id: string; frame_variant_id: number | null }>) {
    if (slot.frame_variant_id == null) continue;

    const { data: pool } = await supabase
      .from('inventory_pool')
      .select('id, pool_quantity')
      .eq('shopify_variant_id', slot.frame_variant_id)
      .maybeSingle();

    if (pool) {
      const poolRow = pool as { id: string; pool_quantity: number };
      await supabase.from('inventory_adjustments').insert({
        inventory_pool_id: poolRow.id,
        delta: 1,
        reason: 'subscription_release',
        user_id: null,
        notes: `Released reservation for expired pending_payment redemption ${slot.id}`,
      });
      await supabase
        .from('inventory_pool')
        .update({ pool_quantity: Number(poolRow.pool_quantity) + 1 })
        .eq('id', poolRow.id);
    }

    released++;
  }

  return { released };
}
