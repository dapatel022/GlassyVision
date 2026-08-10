import { describe, it, expect } from 'vitest';
import { formatFallbackRow } from '@/features/admin/lib/pair-fallbacks';

describe('formatFallbackRow', () => {
  it('formats a well-formed auto_redeem_pair_failed audit row', () => {
    const row = formatFallbackRow({
      entity_id: 'membership-123',
      created_at: '2026-08-05T12:00:00.000Z',
      after_data: {
        order_id: 'order-1',
        pair_index: 2,
        frame_variant_id: 999,
        handle: 'aviator-classic',
        reason: 'out_of_stock',
      },
    });

    expect(row).toEqual({
      membershipId: 'membership-123',
      pairIndex: '2',
      handle: 'aviator-classic',
      reason: 'out_of_stock',
      when: new Date('2026-08-05T12:00:00.000Z').toLocaleDateString(),
    });
  });

  it('degrades missing after_data fields to em-dash while keeping membershipId/when', () => {
    const row = formatFallbackRow({
      entity_id: 'membership-456',
      created_at: '2026-07-01T00:00:00.000Z',
      after_data: {
        // no pair_index, handle, or reason — mirrors an older/partial write.
      },
    });

    expect(row.membershipId).toBe('membership-456');
    expect(row.when).toBe(new Date('2026-07-01T00:00:00.000Z').toLocaleDateString());
    expect(row.pairIndex).toBe('—');
    expect(row.handle).toBe('—');
    expect(row.reason).toBe('—');
  });

  it('degrades every field to em-dash for a completely malformed/null entry', () => {
    expect(formatFallbackRow({ entity_id: null, created_at: null, after_data: null })).toEqual({
      membershipId: '—',
      pairIndex: '—',
      handle: '—',
      reason: '—',
      when: '—',
    });

    expect(formatFallbackRow(null)).toEqual({
      membershipId: '—',
      pairIndex: '—',
      handle: '—',
      reason: '—',
      when: '—',
    });

    expect(formatFallbackRow(undefined)).toEqual({
      membershipId: '—',
      pairIndex: '—',
      handle: '—',
      reason: '—',
      when: '—',
    });
  });

  it('formats an auto_redeem_pair_anomaly row identically — same after_data shape, different reason vocabulary', () => {
    // auto-redeem-pairs.ts writes anomalies (e.g. status_update_failed) with
    // the exact same after_data fields as ordinary fallbacks — only the
    // action string on the audit_log row differs, which this pure formatter
    // never inspects. See src/app/admin/memberships/page.tsx for the two
    // separately-queried, separately-labelled admin sections.
    const row = formatFallbackRow({
      entity_id: 'membership-789',
      created_at: '2026-08-06T09:30:00.000Z',
      after_data: {
        order_id: 'order-2',
        pair_index: 1,
        frame_variant_id: 501,
        handle: 'dusk-wayfarer',
        reason: 'status_update_failed',
        slot_id: 's1',
        synthesized_order_id: 'ro1',
      },
    });

    expect(row).toEqual({
      membershipId: 'membership-789',
      pairIndex: '1',
      handle: 'dusk-wayfarer',
      reason: 'status_update_failed',
      when: new Date('2026-08-06T09:30:00.000Z').toLocaleDateString(),
    });
  });
});
