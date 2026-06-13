import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateWorkOrderPdf = vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3])));
vi.mock('@/features/admin/work-orders/lib/pdf-generator', () => ({ generateWorkOrderPdf }));

const mockFrom = vi.fn();
const upload = vi.fn(() => Promise.resolve({ error: null }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom, storage: { from: () => ({ upload }) } })),
}));

vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: 'lab-1', email: 'l@x.com', role: 'lab_operator', fullName: 'L' })),
  isLabRole: (role: string) => ['founder', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping'].includes(role),
  isAdminRole: (role: string) => role === 'founder' || role === 'reviewer',
}));

function installWoData(released = true) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'work_orders') return {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'wo-1', order_id: 'o-1', rx_file_id: 'rx-1', work_order_number: 'WO-1', frame_sku: 'X', lens_type: 'single_vision', lens_material: 'cr39', released_to_lab_at: released ? '2026-05-01T00:00:00Z' : null }, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    };
    if (table === 'orders') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { shopify_order_number: 'GV-1', customer_name: 'A' }, error: null }) }) }) };
    if (table === 'rx_files') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) }) };
    if (table === 'audit_log') return { insert: () => Promise.resolve({ error: null }) };
    return {};
  });
}

const params = Promise.resolve({ id: 'wo-1' });
const req = {} as Parameters<typeof import('@/app/api/work-orders/[id]/pdf/route').GET>[0];

beforeEach(() => {
  mockFrom.mockReset();
  generateWorkOrderPdf.mockClear();
});

describe('GET /api/work-orders/[id]/pdf — Rx PII access control', () => {
  it('returns 401 to an anonymous caller and never generates the Rx PDF', async () => {
    const { getCurrentUser } = await import('@/lib/auth/middleware');
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    installWoData();
    const { GET } = await import('@/app/api/work-orders/[id]/pdf/route');
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
    expect(generateWorkOrderPdf).not.toHaveBeenCalled();
  });

  it('returns 403 to a zero-access (pending) user', async () => {
    const { getCurrentUser } = await import('@/lib/auth/middleware');
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: 'p-1', email: 'p@x.com', role: 'pending', fullName: 'P' });
    installWoData();
    const { GET } = await import('@/app/api/work-orders/[id]/pdf/route');
    const res = await GET(req, { params });
    expect(res.status).toBe(403);
    expect(generateWorkOrderPdf).not.toHaveBeenCalled();
  });

  it('serves the PDF to a lab user for a released work order', async () => {
    installWoData(true);
    const { GET } = await import('@/app/api/work-orders/[id]/pdf/route');
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(generateWorkOrderPdf).toHaveBeenCalledTimes(1);
  });

  it('blocks a lab user from an UNRELEASED work order (no early Rx-PII access)', async () => {
    installWoData(false);
    const { GET } = await import('@/app/api/work-orders/[id]/pdf/route');
    const res = await GET(req, { params });
    expect(res.status).toBe(403);
    expect(generateWorkOrderPdf).not.toHaveBeenCalled();
  });

  it('serves an UNRELEASED work order to an admin (reviewer)', async () => {
    const { getCurrentUser } = await import('@/lib/auth/middleware');
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: 'r-1', email: 'r@x.com', role: 'reviewer', fullName: 'R' });
    installWoData(false);
    const { GET } = await import('@/app/api/work-orders/[id]/pdf/route');
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
  });
});
