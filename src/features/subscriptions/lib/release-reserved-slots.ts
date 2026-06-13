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

    // Atomic +1 release + ledger row in one statement (audit C8).
    await supabase.rpc('release_inventory_unit', {
      p_variant_id: slot.frame_variant_id,
      p_reason: 'subscription_release',
      p_redemption_id: slot.id,
      p_notes: `Released reservation for expired pending_payment redemption ${slot.id}`,
    });

    released++;
  }

  return { released };
}
