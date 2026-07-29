import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}));
vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: 'admin-1', email: 'a@x.com', role: 'founder', fullName: 'A' })),
  isAdminRole: (role: string) => role === 'founder' || role === 'reviewer',
}));
vi.mock('@/lib/commerce/shopify-admin', () => ({
  adminFetch: vi.fn(),
  updateInventoryLevel: vi.fn(),
}));

describe('adjustInventory', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
  });

  it('adjusts via the atomic RPC (no read-modify-write)', async () => {
    mockRpc.mockResolvedValueOnce({ data: 7, error: null });

    const { adjustInventory } = await import('@/features/admin/inventory/actions/adjust-inventory');
    const result = await adjustInventory('pool-1', 3, 'restock', 'weekly restock');

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('adjust_inventory_pool', {
      p_pool_id: 'pool-1', p_delta: 3, p_reason: 'restock', p_user_id: 'admin-1', p_notes: 'weekly restock',
    });
    // The action must not write the ledger itself — the RPC owns that.
    expect(mockFrom).not.toHaveBeenCalledWith('inventory_adjustments');
  });

  it('reports would-go-negative when the RPC returns null for an existing pool', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    mockFrom.mockImplementation((table: string) =>
      table === 'inventory_pool'
        ? { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'pool-1' }, error: null }) }) }) }
        : {},
    );

    const { adjustInventory } = await import('@/features/admin/inventory/actions/adjust-inventory');
    const result = await adjustInventory('pool-1', -99, 'damaged', null);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Quantity would go negative');
  });

  it('reports pool-not-found when the RPC returns null and no pool row exists', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    mockFrom.mockImplementation((table: string) =>
      table === 'inventory_pool'
        ? { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }
        : {},
    );

    const { adjustInventory } = await import('@/features/admin/inventory/actions/adjust-inventory');
    const result = await adjustInventory('pool-x', 1, 'restock', null);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Pool not found');
  });
});
