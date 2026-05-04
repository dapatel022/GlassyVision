import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendEmailMock = vi.fn();
vi.mock('@/lib/email/resend', () => ({ sendEmail: sendEmailMock }));

vi.mock('@/features/rx-intake/lib/rx-token', () => ({
  generateRxToken: vi.fn(() => ({ token: 'tok', exp: 999 })),
}));

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

interface OrderRow {
  id: string;
  shopify_order_number: string;
  customer_email: string;
  created_at: string;
}

interface CommRow {
  metadata: { reminder_day?: number } | null;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function setupMockTables(opts: {
  orders: OrderRow[];
  commsByOrder?: Record<string, CommRow[]>;
  insertCapture?: { rows: unknown[] };
}) {
  const insertCapture = opts.insertCapture ?? { rows: [] };
  mockFrom.mockImplementation((table: string) => {
    if (table === 'orders') {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: opts.orders, error: null }),
        }),
      };
    }
    if (table === 'communications') {
      return {
        select: () => ({
          eq: (_col1: string, _val1: string) => ({
            eq: (_col2: string, _val2: string) => Promise.resolve({
              data: opts.commsByOrder?.[_val1] ?? [],
              error: null,
            }),
          }),
        }),
        insert: vi.fn((row: unknown) => {
          insertCapture.rows.push(row);
          return Promise.resolve({ error: null });
        }),
      };
    }
    return {};
  });
  return insertCapture;
}

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const ORIGINAL_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

describe('rx-reminder cron route', () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({ success: true, providerMessageId: 'msg-1' });
    mockFrom.mockReset();
    process.env.CRON_SECRET = 'test-secret';
    process.env.NEXT_PUBLIC_BASE_URL = 'https://glassyvision.com';
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    process.env.NEXT_PUBLIC_BASE_URL = ORIGINAL_BASE_URL;
  });

  function buildRequest(authHeader?: string): Request {
    const headers = new Headers();
    if (authHeader) headers.set('authorization', authHeader);
    return new Request('https://x/api/cron/rx-reminder', { headers });
  }

  it('rejects unauthorized requests with 401', async () => {
    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    const res = await GET(buildRequest('Bearer wrong'));
    expect(res.status).toBe(401);
  });

  it('rejects requests with no auth header at all', async () => {
    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
  });

  it('sends a day-1 reminder for an order created ~1 day ago with no prior sends', async () => {
    const insertCapture = setupMockTables({
      orders: [{
        id: 'o-1',
        shopify_order_number: 'GV-1001',
        customer_email: 'c@x.com',
        created_at: daysAgoIso(1.1),
      }],
    });

    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    const res = await GET(buildRequest('Bearer test-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sent).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe('c@x.com');
    expect(insertCapture.rows).toHaveLength(1);
    const insertedRow = insertCapture.rows[0] as { metadata: { reminder_day: number }; type: string; status: string };
    expect(insertedRow.type).toBe('rx_reminder');
    expect(insertedRow.metadata.reminder_day).toBe(1);
    expect(insertedRow.status).toBe('sent');
  });

  it('skips orders that are not yet 1 day old', async () => {
    setupMockTables({
      orders: [{
        id: 'o-1',
        shopify_order_number: 'GV-1001',
        customer_email: 'c@x.com',
        created_at: daysAgoIso(0.5),
      }],
    });

    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    const res = await GET(buildRequest('Bearer test-secret'));
    const body = await res.json();

    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('does not re-send a reminder day that was already sent (idempotency)', async () => {
    setupMockTables({
      orders: [{
        id: 'o-1',
        shopify_order_number: 'GV-1001',
        customer_email: 'c@x.com',
        created_at: daysAgoIso(2),
      }],
      commsByOrder: {
        'o-1': [{ metadata: { reminder_day: 1 } }],
      },
    });

    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    const res = await GET(buildRequest('Bearer test-secret'));
    const body = await res.json();

    expect(body.sent).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('records a failed-status comms row when sendEmail fails', async () => {
    sendEmailMock.mockResolvedValueOnce({ success: false, error: 'Resend boom' });
    const insertCapture = setupMockTables({
      orders: [{
        id: 'o-1',
        shopify_order_number: 'GV-1001',
        customer_email: 'c@x.com',
        created_at: daysAgoIso(1.1),
      }],
    });

    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    const res = await GET(buildRequest('Bearer test-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sent).toBe(0);
    expect(body.errors).toHaveLength(1);
    const insertedRow = insertCapture.rows[0] as { status: string; metadata: { reminder_day: number } };
    expect(insertedRow.status).toBe('failed');
    expect(insertedRow.metadata.reminder_day).toBe(1);
  });

  it('first-send catch-up: 20-day-old order with no sends gets day 14', async () => {
    const insertCapture = setupMockTables({
      orders: [{
        id: 'o-1',
        shopify_order_number: 'GV-1042',
        customer_email: 'late@x.com',
        created_at: daysAgoIso(20),
      }],
    });

    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    await GET(buildRequest('Bearer test-secret'));

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const insertedRow = insertCapture.rows[0] as { metadata: { reminder_day: number } };
    expect(insertedRow.metadata.reminder_day).toBe(14);
  });
});
