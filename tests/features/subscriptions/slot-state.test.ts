import { describe, it, expect } from 'vitest';
import { deriveSlotState } from '@/features/subscriptions/lib/slot-state';

describe('deriveSlotState', () => {
  it('maps every redemption_status enum value', () => {
    expect(deriveSlotState({ status: 'available' }, 'active')).toBe('available');
    expect(deriveSlotState({ status: 'awaiting_rx' }, 'active')).toBe('awaiting_rx');
    expect(deriveSlotState({ status: 'in_review' }, 'active')).toBe('awaiting_rx');
    expect(deriveSlotState({ status: 'rx_rejected' }, 'active')).toBe('awaiting_rx');
    expect(deriveSlotState({ status: 'in_production' }, 'active')).toBe('in_production');
    expect(deriveSlotState({ status: 'awaiting_fulfillment' }, 'active')).toBe('in_production');
    expect(deriveSlotState({ status: 'shipped' }, 'active')).toBe('shipped');
    expect(deriveSlotState({ status: 'delivered' }, 'active')).toBe('shipped');
    expect(deriveSlotState({ status: 'locked' }, 'active')).toBe('reserved');
    expect(deriveSlotState({ status: 'pending_payment' }, 'active')).toBe('reserved');
    expect(deriveSlotState({ status: 'expired' }, 'active')).toBe('expired');
    expect(deriveSlotState({ status: 'cancelled' }, 'active')).toBe('expired');
  });

  it('an available slot on an expired membership is expired, not redeemable', () => {
    expect(deriveSlotState({ status: 'available' }, 'expired')).toBe('expired');
    expect(deriveSlotState({ status: 'available' }, 'grace')).toBe('available');
  });

  it('unknown statuses default to reserved — never show a redeem CTA for in-flight work', () => {
    expect(deriveSlotState({ status: 'some_future_status' }, 'active')).toBe('reserved');
  });
});
