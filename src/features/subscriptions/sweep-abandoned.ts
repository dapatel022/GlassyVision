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
    // Reset the slot first so a concurrent confirmation can't double-act on it.
    await supabase
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
      .eq('id', slot.id);

    // Release the reserved unit of stock, if a frame was selected.
    if (slot.frame_variant_id != null) {
      const { data: pool } = await supabase
        .from('inventory_pool')
        .select('id, pool_quantity')
        .eq('shopify_variant_id', slot.frame_variant_id)
        .maybeSingle();

      if (pool) {
        await supabase.from('inventory_adjustments').insert({
          inventory_pool_id: pool.id,
          delta: 1,
          reason: 'subscription_release',
          user_id: null,
          notes: `Released abandoned reservation for redemption ${slot.id}`,
        });
        await supabase
          .from('inventory_pool')
          .update({ pool_quantity: Number(pool.pool_quantity) + 1 })
          .eq('id', pool.id);
      }
    }

    released++;
  }

  return { released };
}
