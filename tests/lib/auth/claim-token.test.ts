import { describe, it, expect, beforeEach } from 'vitest';
import { generateClaimToken, verifyClaimToken, buildClaimUrl } from '@/lib/auth/claim-token';

beforeEach(() => {
  process.env.CLAIM_TOKEN_SECRET = 'test-secret';
});

describe('claim-token', () => {
  it('verifies a freshly generated token', () => {
    const { token, exp } = generateClaimToken('cust-1');
    expect(verifyClaimToken('cust-1', token, exp)).toBe(true);
  });

  it('rejects a token for a different customer id', () => {
    const { token, exp } = generateClaimToken('cust-1');
    expect(verifyClaimToken('cust-2', token, exp)).toBe(false);
  });

  it('rejects an expired token', () => {
    const { token } = generateClaimToken('cust-1');
    expect(verifyClaimToken('cust-1', token, Date.now() - 1000)).toBe(false);
  });

  it('rejects a tampered token', () => {
    const { exp } = generateClaimToken('cust-1');
    expect(verifyClaimToken('cust-1', 'deadbeef', exp)).toBe(false);
  });

  it('builds a claim URL with cid, token and exp', () => {
    const url = buildClaimUrl('cust-1', 'https://glassyvision.com');
    expect(url).toMatch(/^https:\/\/glassyvision\.com\/account\/claim\?cid=cust-1&token=[a-f0-9]+&exp=\d+$/);
  });
});
