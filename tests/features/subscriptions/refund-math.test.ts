import { describe, it, expect } from 'vitest';
import { computeProRataRefund } from '@/features/subscriptions/lib/refund-math';

describe('computeProRataRefund', () => {
  it('refunds the uncommitted fraction of captured amount', () => {
    // $150 captured, 3 pairs, 2 uncommitted -> 2/3 * 150 = 100.00
    expect(computeProRataRefund({ capturedAmount: 150, pairsTotal: 3, uncommittedCount: 2 })).toBe(100);
  });
  it('returns 0 when nothing is uncommitted', () => {
    expect(computeProRataRefund({ capturedAmount: 150, pairsTotal: 3, uncommittedCount: 0 })).toBe(0);
  });
  it('refunds full captured amount when all pairs uncommitted', () => {
    expect(computeProRataRefund({ capturedAmount: 150, pairsTotal: 3, uncommittedCount: 3 })).toBe(150);
  });
  it('rounds to 2 decimals (banker-safe down)', () => {
    // 100 / 3 * 1 = 33.333 -> 33.33
    expect(computeProRataRefund({ capturedAmount: 100, pairsTotal: 3, uncommittedCount: 1 })).toBe(33.33);
  });
  it('never exceeds captured and never negative', () => {
    expect(computeProRataRefund({ capturedAmount: 150, pairsTotal: 3, uncommittedCount: 5 })).toBe(150);
    expect(computeProRataRefund({ capturedAmount: 0, pairsTotal: 3, uncommittedCount: 2 })).toBe(0);
  });
});
