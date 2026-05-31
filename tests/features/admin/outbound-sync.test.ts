import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdminFetch = vi.fn();
const mockUpdateInventoryLevel = vi.fn();
const mockCreateRefund = vi.fn();

vi.mock('@/lib/commerce/shopify-admin', () => ({
  adminFetch: mockAdminFetch,
  updateInventoryLevel: mockUpdateInventoryLevel,
  createRefund: mockCreateRefund,
}));

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

describe('Outbound Shopify Integrations', () => {
  beforeEach(() => {
    mockAdminFetch.mockReset();
    mockUpdateInventoryLevel.mockReset();
    mockCreateRefund.mockReset();
    mockFrom.mockReset();
  });

  describe('pushInventoryToShopify', () => {
    it('successfully updates inventory levels on Shopify', async () => {
      // Mock pool lookup
      const mockSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({
            data: { shopify_variant_id: 12345, pool_quantity: 10 },
            error: null,
          })),
        })),
      }));
      mockFrom.mockImplementation((table: string) => {
        if (table === 'inventory_pool') return { select: mockSelect };
        return {};
      });

      // Mock variants.json lookup and locations.json lookup
      mockAdminFetch
        .mockResolvedValueOnce({ variant: { id: 12345, inventory_item_id: 67890 } })
        .mockResolvedValueOnce({ locations: [{ id: 999 }] });

      mockUpdateInventoryLevel.mockResolvedValueOnce({ success: true });

      const { pushInventoryToShopify } = await import('@/features/admin/inventory/actions/adjust-inventory');
      const result = await pushInventoryToShopify('pool-uuid');

      expect(result.success).toBe(true);
      expect(mockAdminFetch).toHaveBeenCalledTimes(2);
      expect(mockUpdateInventoryLevel).toHaveBeenCalledWith('67890', '999', 10);
    });
  });

  describe('reviewReturn', () => {
    it('creates refund on Shopify and updates return status on approval', async () => {
      // Mock returns selection
      const mockSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({
            data: {
              id: 'ret-123',
              status: 'pending',
              order_id: 'ord-uuid',
              line_item_id: 'item-uuid',
              preferred_resolution: 'refund',
              orders: { shopify_order_id: 1001, currency: 'USD', total: 128 },
              order_line_items: { line_total: 128 },
            },
            error: null,
          })),
        })),
      }));

      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      }));
      const mockInsert = vi.fn(() => Promise.resolve({ error: null }));

      mockFrom.mockImplementation((table: string) => {
        if (table === 'returns') {
          return { select: mockSelect, update: mockUpdate };
        }
        if (table === 'audit_log') {
          return { insert: mockInsert };
        }
        return {};
      });

      // Mock refund creation on Shopify
      mockCreateRefund.mockResolvedValueOnce({ refund: { id: 88888 } });

      const { reviewReturn } = await import('@/features/admin/returns/actions/review-return');
      const result = await reviewReturn({
        returnId: 'ret-123',
        reviewerUserId: 'user-uuid',
        decision: 'approved_refund',
        adminNotes: 'Looks good',
      });

      expect(result.success).toBe(true);
      expect(mockCreateRefund).toHaveBeenCalledWith(1001, 128, 'USD', 'Looks good');
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        admin_decision: 'approved_refund',
        shopify_refund_id: 88888,
        status: 'completed',
      }));
    });

    it('returns error and does not update DB if Shopify refund fails', async () => {
      // Mock returns selection
      const mockSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({
            data: {
              id: 'ret-123',
              status: 'pending',
              orders: { shopify_order_id: 1001, currency: 'USD', total: 128 },
            },
            error: null,
          })),
        })),
      }));

      const mockUpdate = vi.fn();

      mockFrom.mockImplementation((table: string) => {
        if (table === 'returns') {
          return { select: mockSelect, update: mockUpdate };
        }
        return {};
      });

      // Mock refund call failure
      mockCreateRefund.mockRejectedValueOnce(new Error('Shopify rate limit exceeded'));

      const { reviewReturn } = await import('@/features/admin/returns/actions/review-return');
      const result = await reviewReturn({
        returnId: 'ret-123',
        reviewerUserId: 'user-uuid',
        decision: 'approved_refund',
        adminNotes: 'Refund me',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create refund on Shopify');
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
