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
  status: 'queued' | 'sent' | 'failed' | 'delivered' | 'bounced';
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

interface MockOpts {
  orders: OrderRow[];
  ordersError?: { message: string };
  commsByOrder?: Record<string, CommRow[]>;
  commsQueryError?: { message: string };
  claimError?: { message: string };
  updateError?: { message: string };
}

interface Capture {
  inserted: Array<Record<string, unknown>>;
  updates: Array<{ id: string; patch: Record<string, unknown> }>;
}

function setupMockTables(opts: MockOpts): Capture {
  const capture: Capture = { inserted: [], updates: [] };
  let claimSeq = 0;

  mockFrom.mockImplementation((table: string) => {
    if (table === 'orders') {
      return {
        select: () => ({
          eq: () => Promise.resolve({
            data: opts.ordersError ? null : opts.orders,
            error: opts.ordersError ?? null,
          }),
        }),
      };
    }
    if (table === 'communications') {
      return {
        select: () => ({
          eq: (_c1: string, val1: string) => ({
            eq: () => ({
              eq: () => Promise.resolve({
                data: opts.commsQueryError ? null : (opts.commsByOrder?.[val1] ?? []),
                error: opts.commsQueryError ?? null,
              }),
            }),
          }),
        }),
        insert: vi.fn((row: Record<string, unknown>) => {
          if (opts.claimError) {
            return {
              select: () => ({ single: () => Promise.resolve({ data: null, error: opts.claimError }) }),
            };
          }
          capture.inserted.push(row);
          claimSeq++;
          const id = `claim-${claimSeq}`;
          return {
            select: () => ({ single: () => Promise.resolve({ data: { id }, error: null }) }),
          };
        }),
        update: vi.fn((patch: Record<string, unknown>) => ({
          eq: (_col: string, val: string) => {
            capture.updates.push({ id: val, patch });
            return Promise.resolve({ error: opts.updateError ?? null });
          },
        })),
      };
    }
    return {};
  });
  return capture;
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

  it('rejects requests with no auth header', async () => {
    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
  });

  it('rejects when CRON_SECRET is unset, even with a Bearer header', async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    const res = await GET(buildRequest('Bearer anything'));
    expect(res.status).toBe(401);
  });

  it('rejects a Bearer of the wrong length (constant-time guard)', async () => {
    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    const res = await GET(buildRequest('Bearer test-secret-extra-bytes'));
    expect(res.status).toBe(401);
  });

  it('claim-then-send-then-update: day-1 happy path', async () => {
    const capture = setupMockTables({
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

    // Insert came first, with status 'queued' and metadata.reminder_day
    expect(capture.inserted).toHaveLength(1);
    const inserted = capture.inserted[0];
    expect(inserted.status).toBe('queued');
    expect(inserted.direction).toBe('outbound');
    expect(inserted.channel).toBe('email');
    expect((inserted.metadata as { reminder_day: number }).reminder_day).toBe(1);

    // Update flipped status to 'sent'
    expect(capture.updates).toHaveLength(1);
    expect(capture.updates[0].patch.status).toBe('sent');
    expect(capture.updates[0].patch.provider_message_id).toBe('msg-1');
  });

  it('skips orders that are not yet 1 day old (no claim, no send)', async () => {
    const capture = setupMockTables({
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
    expect(capture.inserted).toHaveLength(0);
  });

  it('idempotency: a row marked status=sent for day 1 prevents re-send', async () => {
    setupMockTables({
      orders: [{
        id: 'o-1',
        shopify_order_number: 'GV-1001',
        customer_email: 'c@x.com',
        created_at: daysAgoIso(2),
      }],
      commsByOrder: {
        'o-1': [{ metadata: { reminder_day: 1 }, status: 'sent' }],
      },
    });

    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    const res = await GET(buildRequest('Bearer test-secret'));
    const body = await res.json();

    expect(body.sent).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('failed prior sends do NOT count toward sentDays — day is retried', async () => {
    const capture = setupMockTables({
      orders: [{
        id: 'o-1',
        shopify_order_number: 'GV-1001',
        customer_email: 'c@x.com',
        created_at: daysAgoIso(2),
      }],
      // Prior failed send: metadata cleared, status='failed'. Cron should retry.
      commsByOrder: {
        'o-1': [{ metadata: null, status: 'failed' }],
      },
    });

    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    await GET(buildRequest('Bearer test-secret'));

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(capture.inserted).toHaveLength(1);
  });

  it('failed send: row updated to status=failed with metadata.reminder_day cleared', async () => {
    sendEmailMock.mockResolvedValueOnce({ success: false, error: 'Resend boom' });
    const capture = setupMockTables({
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

    // Errors present → 500 status
    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.sent).toBe(0);
    expect(body.errors).toHaveLength(1);

    // Update flipped status to failed AND cleared reminder_day from metadata
    expect(capture.updates).toHaveLength(1);
    expect(capture.updates[0].patch.status).toBe('failed');
    const patchedMeta = capture.updates[0].patch.metadata as { reminder_day?: number };
    expect(patchedMeta.reminder_day).toBeUndefined();
  });

  it('claim error from concurrent run: skips order without sending', async () => {
    setupMockTables({
      orders: [{
        id: 'o-1',
        shopify_order_number: 'GV-1001',
        customer_email: 'c@x.com',
        created_at: daysAgoIso(1.1),
      }],
      claimError: { message: 'duplicate key value violates unique constraint' },
    });

    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    const res = await GET(buildRequest('Bearer test-secret'));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].error).toContain('claim slot');
  });

  it('first-send catch-up: 20-day-old order with no sends gets day 14', async () => {
    const capture = setupMockTables({
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
    const inserted = capture.inserted[0];
    expect((inserted.metadata as { reminder_day: number }).reminder_day).toBe(14);
  });

  it('multi-order run: mixed outcomes do not abort the batch', async () => {
    sendEmailMock
      .mockResolvedValueOnce({ success: true, providerMessageId: 'msg-1' })
      .mockResolvedValueOnce({ success: false, error: 'Resend rate-limited' });

    const capture = setupMockTables({
      orders: [
        { id: 'o-1', shopify_order_number: 'GV-1001', customer_email: 'a@x.com', created_at: daysAgoIso(1.1) }, // sends day 1
        { id: 'o-2', shopify_order_number: 'GV-1002', customer_email: 'b@x.com', created_at: daysAgoIso(0.5) }, // not yet due
        { id: 'o-3', shopify_order_number: 'GV-1003', customer_email: 'c@x.com', created_at: daysAgoIso(1.1) }, // sends, fails
      ],
    });

    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    const res = await GET(buildRequest('Bearer test-secret'));
    const body = await res.json();

    expect(res.status).toBe(500); // because of the failure
    expect(body.sent).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.errors).toHaveLength(1);

    expect(sendEmailMock).toHaveBeenCalledTimes(2); // o-1 and o-3
    expect(capture.inserted).toHaveLength(2); // both attempted to claim
  });

  it('per-iteration crash: one bad order does not break the rest', async () => {
    sendEmailMock
      .mockRejectedValueOnce(new Error('synchronous boom from network stack'))
      .mockResolvedValueOnce({ success: true, providerMessageId: 'msg-2' });

    const capture = setupMockTables({
      orders: [
        { id: 'o-1', shopify_order_number: 'GV-1001', customer_email: 'a@x.com', created_at: daysAgoIso(1.1) },
        { id: 'o-2', shopify_order_number: 'GV-1002', customer_email: 'b@x.com', created_at: daysAgoIso(1.1) },
      ],
    });

    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    const res = await GET(buildRequest('Bearer test-secret'));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.sent).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].error).toContain('crash');
    // Second order still processed
    expect(capture.updates.some((u) => u.patch.status === 'sent')).toBe(true);
  });

  it('email URL is composed from shopify_order_number, not the DB id', async () => {
    setupMockTables({
      orders: [{
        id: 'a99e9f3c-aaaa-bbbb-cccc-dddddddddddd',
        shopify_order_number: 'GV-7777',
        customer_email: 'c@x.com',
        created_at: daysAgoIso(1.1),
      }],
    });

    const { GET } = await import('@/app/api/cron/rx-reminder/route');
    await GET(buildRequest('Bearer test-secret'));

    const sendArgs = sendEmailMock.mock.calls[0][0];
    expect(sendArgs.text).toContain('/rx/GV-7777?');
    expect(sendArgs.text).not.toContain('a99e9f3c');
    expect(sendArgs.html).toContain('/rx/GV-7777?');
  });
});
