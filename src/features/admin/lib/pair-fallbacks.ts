/**
 * Formats an `audit_log` row for the `auto_redeem_pair_failed` admin queue
 * (`/admin/memberships`). These rows are written by
 * `autoRedeemConfiguredPairs` (src/features/subscriptions/auto-redeem-pairs.ts)
 * — one per pair that failed to auto-provision, so an admin can manually
 * refund or credit the customer.
 *
 * Historical rows may be partial (a schema tweak, a hand-inserted row, a
 * future reason we haven't seen yet), so every field degrades independently
 * to '—' rather than throwing or dropping the row from the queue.
 */

const FALLBACK = '—';

export interface PairFallbackAuditEntry {
  entity_id?: string | null;
  created_at?: string | null;
  // Typed loosely (matches Supabase's generated `Json` column type, and lets
  // test fixtures pass extra fields like order_id/frame_variant_id without
  // fighting excess-property checks) — narrowed defensively below since
  // these rows are historical data and may be partial or malformed.
  after_data?: unknown;
}

export interface FormattedFallbackRow {
  membershipId: string;
  pairIndex: string;
  handle: string;
  reason: string;
  when: string;
}

function stringOrFallback(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return FALLBACK;
}

/** Matches the `new Date(...).toLocaleDateString()` convention used across
 * other admin pages (e.g. src/app/admin/memberships/page.tsx,
 * src/app/admin/memberships/[id]/page.tsx). */
function formatWhen(createdAt: unknown): string {
  if (typeof createdAt !== 'string' || createdAt.trim().length === 0) return FALLBACK;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return FALLBACK;
  return date.toLocaleDateString();
}

export function formatFallbackRow(entry: PairFallbackAuditEntry | null | undefined): FormattedFallbackRow {
  const rawAfterData = entry?.after_data;
  const afterData: Record<string, unknown> =
    rawAfterData && typeof rawAfterData === 'object' && !Array.isArray(rawAfterData)
      ? (rawAfterData as Record<string, unknown>)
      : {};
  return {
    membershipId: stringOrFallback(entry?.entity_id),
    pairIndex: stringOrFallback(afterData.pair_index),
    handle: stringOrFallback(afterData.handle),
    reason: stringOrFallback(afterData.reason),
    when: formatWhen(entry?.created_at),
  };
}
