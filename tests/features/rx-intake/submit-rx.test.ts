import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockStorage = {
  from: vi.fn(() => ({
    download: vi.fn(() => Promise.resolve({ data: new Blob(['fake']), error: null })),
  })),
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
    storage: mockStorage,
  })),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers({
    'x-forwarded-for': '203.0.113.42',
    'user-agent': 'Mozilla/5.0 (test)',
  }))),
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    metadata: vi.fn(() => Promise.resolve({ width: 1200, height: 800, format: 'jpeg' })),
    jpeg: vi.fn(() => ({
      toBuffer: vi.fn(() => Promise.resolve(Buffer.from('converted'))),
    })),
  })),
}));

function buildOrderSelect(customerEmail = 'alex@example.com') {
  const single = vi.fn(() => Promise.resolve({
    data: { customer_email: customerEmail },
    error: null,
  }));
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  return { select };
}

describe('submitRx', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('rejects when certification is not checked', async () => {
    const { submitRx } = await import('@/features/rx-intake/actions/submit-rx');

    const result = await submitRx({
      orderId: 'GV-1001',
      lineItemId: 'line-1',
      storagePath: 'GV-1001/line-1/test.jpg',
      mimeType: 'image/jpeg',
      certificationChecked: false,
      typedValues: null,
      expirationDate: null,
    });

    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.field === 'certification')).toBe(true);
  });

  it('rejects when expiration date is in the past', async () => {
    const { submitRx } = await import('@/features/rx-intake/actions/submit-rx');

    const result = await submitRx({
      orderId: 'GV-1001',
      lineItemId: 'line-1',
      storagePath: 'GV-1001/line-1/test.jpg',
      mimeType: 'image/jpeg',
      certificationChecked: true,
      typedValues: null,
      expirationDate: '2020-01-01',
    });

    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.field === 'expirationDate')).toBe(true);
  });

  it('succeeds with valid inputs and creates rx_files row with looked-up email', async () => {
    const mockInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({
          data: { id: 'rx-file-1' },
          error: null,
        })),
      })),
    }));
    const mockUpdate = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          ...buildOrderSelect('alex@example.com'),
          update: mockUpdate,
        };
      }
      if (table === 'rx_files') return { insert: mockInsert };
      return { insert: mockInsert };
    });

    const { submitRx } = await import('@/features/rx-intake/actions/submit-rx');

    const result = await submitRx({
      orderId: 'GV-1001',
      lineItemId: 'line-1',
      storagePath: 'GV-1001/line-1/test.jpg',
      mimeType: 'image/jpeg',
      certificationChecked: true,
      typedValues: null,
      expirationDate: null,
    });

    expect(result.success).toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const insertArg = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.customer_email).toBe('alex@example.com');
    expect(insertArg.uploaded_by_ip).toBe('203.0.113.42');
    expect(insertArg.uploaded_by_user_agent).toBe('Mozilla/5.0 (test)');
  });

  it('rejects when order is not found', async () => {
    const notFoundSelect = () => {
      const single = vi.fn(() => Promise.resolve({ data: null, error: { message: 'not found' } }));
      const eq = vi.fn(() => ({ single }));
      const select = vi.fn(() => ({ eq }));
      return { select };
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') return notFoundSelect();
      return {};
    });

    const { submitRx } = await import('@/features/rx-intake/actions/submit-rx');

    const result = await submitRx({
      orderId: 'GV-9999',
      lineItemId: 'line-1',
      storagePath: 'GV-9999/line-1/test.jpg',
      mimeType: 'image/jpeg',
      certificationChecked: true,
      typedValues: null,
      expirationDate: null,
    });

    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.field === 'order')).toBe(true);
  });
});
