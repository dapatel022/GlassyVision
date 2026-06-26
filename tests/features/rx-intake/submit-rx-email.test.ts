import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendOnce = vi.fn();
vi.mock('@/lib/email/transactional', () => ({ sendOrderEmailOnce: (...a: unknown[]) => sendOnce(...a) }));
vi.mock('@/lib/email/templates/rx-received', () => ({ renderRxReceived: () => ({ subject: 's', html: 'h', text: 't' }) }));

// Mirror the submit-rx.test.ts harness so we reach the success path.
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

vi.mock('@/features/rx-intake/lib/rx-token', () => ({
  verifyRxToken: vi.fn(() => true),
}));

const TOKEN = { token: 'valid-token', exp: 9999999999999 };

function buildOrderSelect(customerEmail = 'alex@example.com', shopifyOrderNumber = 'GV-1001') {
  const single = vi.fn(() => Promise.resolve({
    data: { customer_email: customerEmail, shopify_order_number: shopifyOrderNumber },
    error: null,
  }));
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  return { select };
}

beforeEach(() => {
  sendOnce.mockReset();
  sendOnce.mockResolvedValue({ sent: true });
  mockFrom.mockReset();
});

describe('submitRx transactional email', () => {
  it('sends rx_received once on a successful upload', async () => {
    const mockInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'rx-file-1' }, error: null })),
      })),
    }));
    const mockUpdate = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') return { ...buildOrderSelect('alex@example.com'), update: mockUpdate };
      if (table === 'rx_files') return { insert: mockInsert };
      return { insert: mockInsert };
    });

    const { submitRx } = await import('@/features/rx-intake/actions/submit-rx');

    const result = await submitRx({
      orderId: 'GV-1001',
      publicOrderId: 'GV-1001',
      ...TOKEN,
      lineItemId: 'line-1',
      storagePath: 'GV-1001/line-1/test.jpg',
      mimeType: 'image/jpeg',
      certificationChecked: true,
      typedValues: null,
      expirationDate: null,
    });

    expect(result.success).toBe(true);
    expect(sendOnce).toHaveBeenCalledWith(expect.objectContaining({ type: 'rx_received' }));
  });

  it('does NOT send when customer_email is no-email@shopify.com', async () => {
    const mockInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'rx-file-2' }, error: null })),
      })),
    }));
    const mockUpdate = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') return { ...buildOrderSelect('no-email@shopify.com'), update: mockUpdate };
      if (table === 'rx_files') return { insert: mockInsert };
      return { insert: mockInsert };
    });

    const { submitRx } = await import('@/features/rx-intake/actions/submit-rx');

    const result = await submitRx({
      orderId: 'GV-1001',
      publicOrderId: 'GV-1001',
      ...TOKEN,
      lineItemId: 'line-1',
      storagePath: 'GV-1001/line-1/test.jpg',
      mimeType: 'image/jpeg',
      certificationChecked: true,
      typedValues: null,
      expirationDate: null,
    });

    expect(result.success).toBe(true);
    expect(sendOnce).not.toHaveBeenCalled();
  });

  it('email failure does not change the success result', async () => {
    sendOnce.mockRejectedValue(new Error('network error'));

    const mockInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'rx-file-3' }, error: null })),
      })),
    }));
    const mockUpdate = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') return { ...buildOrderSelect('alex@example.com'), update: mockUpdate };
      if (table === 'rx_files') return { insert: mockInsert };
      return { insert: mockInsert };
    });

    const { submitRx } = await import('@/features/rx-intake/actions/submit-rx');

    const result = await submitRx({
      orderId: 'GV-1001',
      publicOrderId: 'GV-1001',
      ...TOKEN,
      lineItemId: 'line-1',
      storagePath: 'GV-1001/line-1/test.jpg',
      mimeType: 'image/jpeg',
      certificationChecked: true,
      typedValues: null,
      expirationDate: null,
    });

    expect(result.success).toBe(true);
  });
});
