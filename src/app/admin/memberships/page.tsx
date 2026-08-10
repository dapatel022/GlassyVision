import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentUser, isAdminRole } from '@/lib/auth/middleware';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatFallbackRow, type FormattedFallbackRow } from '@/features/admin/lib/pair-fallbacks';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS = ['all', 'active', 'grace', 'disputed', 'frozen', 'expired', 'refunded', 'cancelled'] as const;

function thirtyDaysFromNow(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * `auto_redeem_pair_failed` (ordinary "frame sold out, pick another"
 * fallbacks) and `auto_redeem_pair_anomaly` (stuck-slot / data-integrity
 * incidents — see auto-redeem-pairs.ts's auditAnomaly) are written with
 * distinct action strings on purpose: they need different admin responses
 * (refund/credit vs. data-integrity triage), so they're never queried
 * together. `entity_type` is filtered too as defense-in-depth against a
 * future reuse of a similarly-named action from another entity.
 */
async function getPairAuditRows(
  supabase: SupabaseClient,
  action: 'auto_redeem_pair_failed' | 'auto_redeem_pair_anomaly',
): Promise<Array<{ id: string } & FormattedFallbackRow>> {
  const { data } = await supabase
    .from('audit_log')
    .select('id, entity_id, created_at, after_data')
    .eq('action', action)
    .eq('entity_type', 'subscription_memberships')
    .order('created_at', { ascending: false })
    .limit(20);
  return (data ?? []).map((row) => ({ id: row.id, ...formatFallbackRow(row) }));
}

/** Shared table for both pair-audit queues — only the heading/rows/empty
 * copy differ between the ordinary-fallback and anomaly sections. */
function PairAuditTable({ rows, emptyMessage }: { rows: Array<{ id: string } & FormattedFallbackRow>; emptyMessage: string }) {
  if (rows.length === 0) return <p className="text-muted">{emptyMessage}</p>;
  return (
    <div className="overflow-x-auto bg-white border border-line rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-base-deeper text-xs font-mono uppercase tracking-wider text-muted-soft">
          <tr>
            <th className="text-left px-4 py-3">Membership</th>
            <th className="text-right px-4 py-3">Pair</th>
            <th className="text-left px-4 py-3">Frame</th>
            <th className="text-left px-4 py-3">Reason</th>
            <th className="text-left px-4 py-3">When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-line">
              <td className="px-4 py-3 font-mono">
                {row.membershipId === '—' ? (
                  row.membershipId
                ) : (
                  <Link href={`/admin/memberships/${row.membershipId}`} className="text-accent hover:underline">
                    {row.membershipId.slice(0, 8)}…
                  </Link>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{row.pairIndex}</td>
              <td className="px-4 py-3 font-mono">{row.handle}</td>
              <td className="px-4 py-3">{row.reason}</td>
              <td className="px-4 py-3 text-muted">{row.when}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PageProps {
  searchParams: Promise<{ status?: string; expiring?: string }>;
}

export default async function MembershipsAdminPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin/memberships');
  if (!isAdminRole(user.role)) redirect('/unauthorized');

  const { status, expiring } = await searchParams;
  const supabase = createAdminClient();

  let query = supabase
    .from('subscription_memberships')
    .select('id, status, term_start, term_end, pairs_total, currency, customer_id, plan_id, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (status && status !== 'all' && (STATUS_FILTERS as readonly string[]).includes(status)) {
    query = query.eq('status', status as 'active');
  }

  if (expiring === '1') {
    query = query.lte('term_end', thirtyDaysFromNow()).in('status', ['active', 'grace']);
  }

  const { data: memberships } = await query;

  const pairFallbacks = await getPairAuditRows(supabase, 'auto_redeem_pair_failed');
  const pairAnomalies = await getPairAuditRows(supabase, 'auto_redeem_pair_anomaly');

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-xs font-mono text-accent hover:underline uppercase tracking-wider font-bold">
          ← Back to Dashboard
        </Link>
      </div>
      <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink">Memberships</h1>

      <section className="space-y-2">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-soft">
          Pair fallbacks needing attention
        </h2>
        <PairAuditTable rows={pairFallbacks} emptyMessage="None — all configured pairs provisioned cleanly." />
      </section>

      <section className="space-y-2">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-soft">
          Slot anomalies needing data-integrity check
        </h2>
        <PairAuditTable rows={pairAnomalies} emptyMessage="None." />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((s) => {
          const active = (status ?? 'all') === s && expiring !== '1';
          return (
            <Link
              key={s}
              href={s === 'all' ? '/admin/memberships' : `/admin/memberships?status=${s}`}
              className={`px-3 py-1 rounded-full font-mono text-xs uppercase tracking-wider border ${
                active ? 'bg-ink text-white border-ink' : 'border-line text-muted hover:border-accent'
              }`}
            >
              {s}
            </Link>
          );
        })}
        <Link
          href="/admin/memberships?expiring=1"
          className={`px-3 py-1 rounded-full font-mono text-xs uppercase tracking-wider border ${
            expiring === '1' ? 'bg-accent text-white border-accent' : 'border-line text-muted hover:border-accent'
          }`}
        >
          Expiring ≤30d
        </Link>
      </div>

      {(memberships ?? []).length === 0 ? (
        <div className="space-y-1">
          <p className="text-muted font-serif italic">No memberships match.</p>
          <p className="text-xs text-muted-soft">Memberships aren&apos;t created here — they&apos;re provisioned automatically when a customer buys a plan&apos;s membership product (Shopify <code>orders/paid</code> webhook).</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(memberships ?? []).map((m) => (
            <Link
              key={m.id}
              href={`/admin/memberships/${m.id}`}
              className="block p-4 border border-line rounded-xl bg-white hover:border-accent"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm text-ink">{m.id.slice(0, 8)}…</p>
                  <p className="text-xs text-muted mt-1 font-mono">
                    {m.status} · {m.pairs_total} pairs · ends {new Date(m.term_end).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-xs text-muted">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
