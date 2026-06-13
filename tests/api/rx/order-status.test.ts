import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn(() => Promise.resolve({ data: { id: 'order-1' }, error: null }));
const ordersFrom = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: ordersFrom })),
}));

vi.mock('@/features/rx-intake/lib/rx-token', () => ({
  verifyRxToken: vi.fn(() => true),
}));

function req(query: string) {
  const nextUrl = new URL(`http://localhost/api/rx/order-status?${query}`);
  return { nextUrl } as unknown as Parameters<typeof import('@/app/api/rx/order-status/route').GET>[0];
}

beforeEach(() => {
  ordersFrom.mockClear();
});

describe('GET /api/rx/order-status', () => {
  it('returns 400 when orderId is missing', async () => {
    const { GET } = await import('@/app/api/rx/order-status/route');
    const res = await GET(req('token=t&exp=9999999999999'));
    expect(res.status).toBe(400);
    expect(ordersFrom).not.toHaveBeenCalled();
  });

  it('returns 401 when the token is missing', async () => {
    const { GET } = await import('@/app/api/rx/order-status/route');
    const res = await GET(req('orderId=GV-1'));
    expect(res.status).toBe(401);
    expect(ordersFrom).not.toHaveBeenCalled();
  });

  it('returns 401 when the token is invalid (no enumeration oracle)', async () => {
    const { verifyRxToken } = await import('@/features/rx-intake/lib/rx-token');
    vi.mocked(verifyRxToken).mockReturnValueOnce(false);
    const { GET } = await import('@/app/api/rx/order-status/route');
    const res = await GET(req('orderId=GV-1&token=forged&exp=9999999999999'));
    expect(res.status).toBe(401);
    expect(ordersFrom).not.toHaveBeenCalled();
  });

  it('returns existence for a valid token', async () => {
    const { GET } = await import('@/app/api/rx/order-status/route');
    const res = await GET(req('orderId=GV-1&token=valid&exp=9999999999999'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(true);
    expect(ordersFrom).toHaveBeenCalledTimes(1);
  });
});
