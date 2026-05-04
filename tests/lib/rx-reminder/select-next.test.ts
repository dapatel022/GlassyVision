import { describe, it, expect } from 'vitest';
import { selectNextReminderDay, RX_REMINDER_CADENCE } from '@/lib/rx-reminder/select-next';

describe('selectNextReminderDay', () => {
  it('returns null when order is < 1 day old', () => {
    expect(selectNextReminderDay(0, [])).toBeNull();
  });

  it('returns 1 for a fresh 1-day-old order with no prior sends', () => {
    expect(selectNextReminderDay(1, [])).toBe(1);
  });

  it('first-send catch-up: 20-day-old order with no sends gets day 14, not day 1', () => {
    expect(selectNextReminderDay(20, [])).toBe(14);
  });

  it('first-send catch-up: 65-day-old order with no sends gets day 60', () => {
    expect(selectNextReminderDay(65, [])).toBe(60);
  });

  it('marches forward normally after a prior send', () => {
    expect(selectNextReminderDay(8, [1, 3])).toBe(7);
  });

  it('returns null when caller is past the latest cadence (90)', () => {
    expect(selectNextReminderDay(120, [1, 3, 7, 14, 30, 60, 90])).toBeNull();
  });

  it('returns null when not yet at the next cadence', () => {
    expect(selectNextReminderDay(5, [1, 3])).toBeNull();
  });

  it('does not re-send an already-sent day even on the boundary', () => {
    expect(selectNextReminderDay(7, [1, 3, 7])).toBeNull();
  });

  it('exposes the cadence array', () => {
    expect(RX_REMINDER_CADENCE).toEqual([1, 3, 7, 14, 30, 60, 90]);
  });
});
