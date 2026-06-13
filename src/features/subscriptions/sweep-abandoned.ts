import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Release subscription redemptions whose add-on checkout was abandoned.
 *
 * A redemption in `pending_payment` whose `pending_payment_expires_at` has
 * lapsed (no confirmed surcharge payment arrived) is reset to `available` and
 * its inventory reservation is released (a `+1` `subscription_release`
 * adjustment), so the slot and the frame are freed for reuse. Without this an
 * abandoned checkout would strand both the slot and a unit of stock forever.
 *
 * Idempotent: it only touches rows still in `pending_payment`, so a second run
 * over the same set finds nothing.
 */
export async function sweepAbandonedRedemptions(
  supabase: SupabaseClient,
): Promise<{ released: number }> {
  const nowIso = new Date().toISOString();

  const { data: stale } = await supabase
    .from('subscription_redemptions')
    .select('id, frame_variant_id')
    .eq('status', 'pending_payment')
    .lt('pending_payment_expires_at', nowIso);

  let released = 0;

  for (const slot of (stale ?? []) as Array<{ id: string; frame_variant_id: number | null }>) {
    // Reset the slot ONLY if it is still pending_payment. The status guard in the
    // WHERE clause closes the race with confirmAddonPayment: if a payment
    // confirmation advanced the slot to awaiting_rx between the read above and
    // this write, the update matches zero rows and we must NOT release stock
    // (the slot is now a live, committed order). Releasing unconditionally
    // produced a phantom unit + a re-redeemable slot (audit sweep↔confirm race).
    const { data: resetRows } = await supabase
      .from('subscription_redemptions')
      .update({
        status: 'available',
        frame_variant_id: null,
        lens_config: {} as never,
        ship_to: null,
        expected_surcharge: 0,
        is_premium: false,
        pending_payment_expires_at: null,
      })
      .eq('id', slot.id)
      .eq('status', 'pending_payment')
      .select('id');

    if (!resetRows || resetRows.length === 0) continue;

    // Release the reserved unit of stock, if a frame was selected (atomic, C8).
    if (slot.frame_variant_id != null) {
      await supabase.rpc('release_inventory_unit', {
        p_variant_id: slot.frame_variant_id,
        p_reason: 'subscription_release',
        p_redemption_id: slot.id,
        p_notes: `Released abandoned reservation for redemption ${slot.id}`,
      });
    }

    released++;
  }

  return { released };
}
