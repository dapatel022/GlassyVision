import { describe, it, expect } from 'vitest';
import { generateRxToken, verifyRxToken, parseRxTokenParams } from '@/features/rx-intake/lib/rx-token';

describe('Rx Token', () => {
  const orderId = 'GV-1001';

  describe('generateRxToken', () => {
    it('generates a token and expiry', () => {
      const result = generateRxToken(orderId);
      expect(result.token).toBeTruthy();
      expect(typeof result.token).toBe('string');
      expect(result.exp).toBeGreaterThan(Date.now());
    });

    it('generates different tokens for different orders', () => {
      const a = generateRxToken('GV-1001');
      const b = generateRxToken('GV-1002');
      expect(a.token).not.toBe(b.token);
    });

    it('accepts a custom expiry in days', () => {
      const result = generateRxToken(orderId, 7);
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(result.exp).toBeLessThanOrEqual(Date.now() + sevenDaysMs + 1000);
      expect(result.exp).toBeGreaterThan(Date.now() + sevenDaysMs - 1000);
    });
  });

  describe('verifyRxToken', () => {
    it('returns true for a valid token', () => {
      const { token, exp } = generateRxToken(orderId);
      expect(verifyRxToken(orderId, token, exp)).toBe(true);
    });

    it('returns false for a wrong orderId', () => {
      const { token, exp } = generateRxToken(orderId);
      expect(verifyRxToken('GV-9999', token, exp)).toBe(false);
    });

    it('returns false for a tampered token', () => {
      const { exp } = generateRxToken(orderId);
      expect(verifyRxToken(orderId, 'tampered', exp)).toBe(false);
    });

    it('returns false for an expired token', () => {
      const pastExp = Date.now() - 1000;
      const { token } = generateRxToken(orderId, -1);
      expect(verifyRxToken(orderId, token, pastExp)).toBe(false);
    });

    it('returns false for empty inputs', () => {
      expect(verifyRxToken('', 'token', Date.now())).toBe(false);
      expect(verifyRxToken(orderId, '', Date.now())).toBe(false);
    });
  });

  describe('parseRxTokenParams', () => {
    it('extracts token and exp from URLSearchParams', () => {
      const { token, exp } = generateRxToken(orderId);
      const params = new URLSearchParams({ token, exp: String(exp) });
      const result = parseRxTokenParams(params);
      expect(result).toEqual({ token, exp });
    });

    it('returns null for missing params', () => {
      expect(parseRxTokenParams(new URLSearchParams())).toBeNull();
      expect(parseRxTokenParams(new URLSearchParams({ token: 'x' }))).toBeNull();
      expect(parseRxTokenParams(new URLSearchParams({ exp: '123' }))).toBeNull();
    });

    it('returns null for non-numeric exp', () => {
      expect(parseRxTokenParams(new URLSearchParams({ token: 'x', exp: 'abc' }))).toBeNull();
    });
  });
});
