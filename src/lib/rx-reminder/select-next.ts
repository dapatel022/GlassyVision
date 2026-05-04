export const RX_REMINDER_CADENCE = [1, 3, 7, 14, 30, 60, 90] as const;

export function selectNextReminderDay(
  daysSinceOrder: number,
  sentDays: number[],
): number | null {
  if (daysSinceOrder < 1) return null;

  if (sentDays.length === 0) {
    for (let i = RX_REMINDER_CADENCE.length - 1; i >= 0; i--) {
      const d = RX_REMINDER_CADENCE[i];
      if (d <= daysSinceOrder) return d;
    }
    return null;
  }

  const lastSent = Math.max(...sentDays);
  for (const d of RX_REMINDER_CADENCE) {
    if (d > lastSent && d <= daysSinceOrder) return d;
  }
  return null;
}
