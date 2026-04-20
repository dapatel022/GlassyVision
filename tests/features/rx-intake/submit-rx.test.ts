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

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    metadata: vi.fn(() => Promise.resolve({ width: 1200, height: 800, format: 'jpeg' })),
    jpeg: vi.fn(() => ({
      toBuffer: vi.fn(() => Promise.resolve(Buffer.from('converted'))),
    })),
  })),
}));

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
      ip: '127.0.0.1',
      userAgent: 'test',
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
      ip: '127.0.0.1',
      userAgent: 'test',
    });

    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.field === 'expirationDate')).toBe(true);
  });

  it('succeeds with valid inputs and creates rx_files row', async () => {
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
      if (table === 'rx_files') return { insert: mockInsert };
      if (table === 'orders') return { update: mockUpdate };
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
      ip: '127.0.0.1',
      userAgent: 'test',
    });

    expect(result.success).toBe(true);
    expect(mockInsert).toHaveBeenCalled();
  });
});
