import { describe, it, expect } from 'vitest';
import { verifyShopifyWebhook } from '@/lib/utils/hmac';
import { createHmac } from 'crypto';

describe('verifyShopifyWebhook', () => {
  const secret = 'test-webhook-secret';
  const body = '{"test": true}';

  it('returns true for valid HMAC', () => {
    const hmac = createHmac('sha256', secret)
      .update(body, 'utf-8')
      .digest('base64');

    expect(verifyShopifyWebhook(body, hmac, secret)).toBe(true);
  });

  it('returns false for invalid HMAC', () => {
    expect(verifyShopifyWebhook(body, 'invalid-hmac', secret)).toBe(false);
  });

  it('returns false for empty HMAC', () => {
    expect(verifyShopifyWebhook(body, '', secret)).toBe(false);
  });
});
