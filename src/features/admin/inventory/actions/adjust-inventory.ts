'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/types';

type AdjustmentReason = Database['public']['Enums']['adjustment_reason'];

export async function adjustInventory(
  poolId: string,
  delta: number,
  reason: AdjustmentReason,
  userId: string,
  notes: string | null = null,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { data: pool } = await supabase
    .from('inventory_pool')
    .select('id, pool_quantity')
    .eq('id', poolId)
    .maybeSingle();

  if (!pool) return { success: false, error: 'Pool not found' };

  const next = pool.pool_quantity + delta;
  if (next < 0) return { success: false, error: 'Quantity would go negative' };

  const { error: updErr } = await supabase
    .from('inventory_pool')
    .update({ pool_quantity: next, last_updated_by: userId, last_updated_at: new Date().toISOString() })
    .eq('id', poolId);
  if (updErr) return { success: false, error: 'Failed to update pool' };

  await supabase.from('inventory_adjustments').insert({
    inventory_pool_id: poolId,
    delta,
    reason,
    user_id: userId,
    notes,
  });

  return { success: true };
}

export async function pushInventoryToShopify(_poolId: string): Promise<{ success: boolean; stubbed: true; message: string }> {
  // TODO: Wire Shopify Admin API inventoryAdjustQuantity once the store is configured.
  return { success: true, stubbed: true, message: 'Shopify inventory sync stubbed — configure Admin API credentials to enable.' };
}
