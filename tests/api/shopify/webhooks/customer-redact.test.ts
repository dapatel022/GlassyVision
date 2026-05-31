import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/utils/hmac', () => ({ verifyShopifyWebhook: () => true }));

const maybeSingle = vi.fn();
const fromMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }));

const anonymizeCustomer = vi.fn(() => Promise.resolve({ success: true }));
vi.mock('@/features/account/actions/anonymize-customer', () => ({ anonymizeCustomer }));
vi.mock('@/lib/commerce/sync', () => ({ syncShopifyOrder: vi.fn() }));

function req(topic: string, body: object) {
  return new Request('http://x/api/shopify/webhooks', {
    method: 'POST',
    headers: { 'x-shopify-topic': topic, 'x-shopify-hmac-sha256': 'h', 'x-shopify-webhook-id': `evt-${topic}` },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  anonymizeCustomer.mockClear();
  maybeSingle.mockReset();
  fromMock.mockImplementation((table: string) => {
    if (table === 'webhook_events') {
      return {
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'e-1' }, error: null }) }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    }
    if (table === 'customers') {
      return { select: () => ({ eq: () => ({ maybeSingle }) }) };
    }
    return {};
  });
});

describe('customers/redact webhook', () => {
  it('anonymizes the matching customer by shopify_customer_id', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'cust-1' }, error: null });
    const { POST } = await import('@/app/api/shopify/webhooks/route');
    const res = await POST(req('customers/redact', { customer: { id: 555 } }) as never);
    expect(res.status).toBe(200);
    expect(anonymizeCustomer).toHaveBeenCalledWith('cust-1');
  });

  it('succeeds without error when no matching customer exists', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { POST } = await import('@/app/api/shopify/webhooks/route');
    const res = await POST(req('customers/redact', { customer: { id: 999 } }) as never);
    expect(res.status).toBe(200);
    expect(anonymizeCustomer).not.toHaveBeenCalled();
  });

  it('handles shop/redact with a 200 and no per-customer action', async () => {
    const { POST } = await import('@/app/api/shopify/webhooks/route');
    const res = await POST(req('shop/redact', { shop_id: 1 }) as never);
    expect(res.status).toBe(200);
    expect(anonymizeCustomer).not.toHaveBeenCalled();
  });
});
