/**
 * True when an Rx expiration date is strictly before today (local start of day).
 *
 * Mirrors the intake-time check in `auto-checks.ts` so the same prescription is
 * judged expired the same way at upload and at dispense. A null/absent date is
 * treated as "not expired" — when no expiration was captured, the manual admin
 * review is the gate, consistent with intake behavior.
 */
export function isRxExpired(expirationDate: string | null | undefined): boolean {
  if (!expirationDate) return false;
  // `rx_expiration_date` is a Postgres `date` (e.g. "2026-06-30"). Compare it as
  // a CALENDAR date against today's local calendar date — never via `new Date()`,
  // which parses a date-only string as UTC midnight and would shift the boundary
  // by a day on any non-UTC runtime. An Rx is valid THROUGH its expiration date.
  const [year, month, day] = expirationDate.split('T')[0].split('-').map(Number);
  if (!year || !month || !day) return false;
  const now = new Date();
  const todayTuple = [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  const expTuple = [year, month, day];
  for (let i = 0; i < 3; i++) {
    if (expTuple[i] !== todayTuple[i]) return expTuple[i] < todayTuple[i];
  }
  return false; // same calendar day → not expired
}
