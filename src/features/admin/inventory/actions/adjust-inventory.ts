'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isAdminRole } from '@/lib/auth/middleware';
import type { Database } from '@/lib/supabase/types';
import { adminFetch, updateInventoryLevel } from '@/lib/commerce/shopify-admin';

type AdjustmentReason = Database['public']['Enums']['adjustment_reason'];

export async function adjustInventory(
  poolId: string,
  delta: number,
  reason: AdjustmentReason,
  notes: string | null = null,
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return { success: false, error: 'Forbidden' };
  }
  const userId = user.id;

  const supabase = createAdminClient();

  // Atomic: the RPC does the guard, the pool mutation, and the ledger insert in
  // one statement, eliminating the read-modify-write race where two concurrent
  // adjustments clobbered each other (same fix as 00032's reserve/release).
  const { data: newQty, error: rpcError } = await supabase.rpc('adjust_inventory_pool', {
    p_pool_id: poolId,
    p_delta: delta,
    p_reason: reason,
    p_user_id: userId,
    p_notes: notes,
  });
  if (rpcError) return { success: false, error: 'Failed to update pool' };

  if (newQty === null || newQty === undefined) {
    // NULL means the conditional UPDATE matched no row: pool missing, or the
    // delta would take the quantity negative. Distinguish for a useful message.
    const { data: pool } = await supabase
      .from('inventory_pool')
      .select('id')
      .eq('id', poolId)
      .maybeSingle();
    return { success: false, error: pool ? 'Quantity would go negative' : 'Pool not found' };
  }

  return { success: true };
}

interface ShopifyVariantResponse {
  variant: {
    id: number;
    inventory_item_id: number;
  };
}

interface ShopifyLocationsResponse {
  locations: Array<{
    id: number;
  }>;
}

export async function pushInventoryToShopify(poolId: string): Promise<{ success: boolean; message: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return { success: false, message: 'Forbidden', error: 'Forbidden' };
  }

  const supabase = createAdminClient();

  const { data: pool } = await supabase
    .from('inventory_pool')
    .select('shopify_variant_id, pool_quantity')
    .eq('id', poolId)
    .maybeSingle();

  if (!pool) return { success: false, message: 'Sync failed', error: 'Inventory pool row not found' };

  try {
    // 1. Fetch variant to get inventory_item_id
    const variantData = await adminFetch<ShopifyVariantResponse>(`variants/${pool.shopify_variant_id}.json`);
    const inventoryItemId = variantData?.variant?.inventory_item_id;

    if (!inventoryItemId) {
      return { success: false, message: 'Sync failed', error: 'Variant inventory item ID not found in Shopify' };
    }

    // 2. Resolve Shopify location ID
    let locationId = process.env.SHOPIFY_LOCATION_ID;
    if (!locationId) {
      const locs = await adminFetch<ShopifyLocationsResponse>('locations.json');
      const firstLoc = locs?.locations?.[0]?.id;
      if (!firstLoc) {
        return { success: false, message: 'Sync failed', error: 'No location ID configured or found on Shopify' };
      }
      locationId = String(firstLoc);
    }

    // 3. Set inventory level
    await updateInventoryLevel(String(inventoryItemId), locationId, pool.pool_quantity);

    return {
      success: true,
      message: `Shopify inventory sync successful for variant ${pool.shopify_variant_id} to quantity ${pool.pool_quantity}.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: `Shopify Admin API call failed: ${msg}`, message: 'Failed to sync with Shopify.' };
  }
}
