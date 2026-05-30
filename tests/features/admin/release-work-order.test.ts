import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: 'f-1', email: 'f@x.com', role: 'founder', fullName: 'F' })),
  isAdminRole: (role: string) => role === 'founder' || role === 'reviewer',
}));

interface Overrides {
  wo?: unknown;
  rxFile?: unknown;
  reviews?: unknown;
}

function install(o: Overrides = {}) {
  const wo = 'wo' in o ? o.wo : { rx_file_id: 'rx-1' };
  const rxFile = 'rxFile' in o ? o.rxFile : { storage_path: 'rx/1.jpg', deleted_at: null };
  const reviews = 'reviews' in o ? o.reviews : [{ decision: 'approved' }];
  const woUpdate = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
  const jobUpdate = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case 'work_orders':
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: wo, error: null }) }) }), update: woUpdate };
      case 'rx_files':
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: rxFile, error: null }) }) }) };
      case 'rx_reviews':
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: reviews, error: null }) }) }) };
      case 'lab_jobs':
        return { update: jobUpdate };
      default:
        return {};
    }
  });
  return { woUpdate, jobUpdate };
}

beforeEach(() => mockFrom.mockReset());

describe('releaseWorkOrder — authorization', () => {
  it('rejects non-admin callers (lab operators cannot release to lab) without touching the DB', async () => {
    const { getCurrentUser } = await import('@/lib/auth/middleware');
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: 'op-1', email: 'op@x.com', role: 'lab_operator', fullName: 'O' });
    install();
    const { releaseWorkOrder } = await import('@/features/admin/work-orders/actions/release-work-order');
    const result = await releaseWorkOrder('wo-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('allows an admin to release a fully-compliant work order', async () => {
    const { woUpdate } = install();
    const { releaseWorkOrder } = await import('@/features/admin/work-orders/actions/release-work-order');
    const result = await releaseWorkOrder('wo-1');
    expect(result.success).toBe(true);
    expect(woUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('releaseWorkOrder — compliance pre-check', () => {
  it('refuses to release a work order with no Rx file on record', async () => {
    const { woUpdate } = install({ wo: { rx_file_id: null } });
    const { releaseWorkOrder } = await import('@/features/admin/work-orders/actions/release-work-order');
    const result = await releaseWorkOrder('wo-1');
    expect(result.success).toBe(false);
    expect(woUpdate).not.toHaveBeenCalled();
  });

  it('refuses to release when the Rx image was soft-deleted', async () => {
    const { woUpdate } = install({ rxFile: { storage_path: 'rx/1.jpg', deleted_at: '2026-05-02T00:00:00Z' } });
    const { releaseWorkOrder } = await import('@/features/admin/work-orders/actions/release-work-order');
    const result = await releaseWorkOrder('wo-1');
    expect(result.success).toBe(false);
    expect(woUpdate).not.toHaveBeenCalled();
  });

  it('refuses to release when the Rx is not approved', async () => {
    const { woUpdate } = install({ reviews: [{ decision: 'rejected' }] });
    const { releaseWorkOrder } = await import('@/features/admin/work-orders/actions/release-work-order');
    const result = await releaseWorkOrder('wo-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/approv/i);
    expect(woUpdate).not.toHaveBeenCalled();
  });
});
