import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/middleware';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS = ['all', 'active', 'grace', 'disputed', 'frozen', 'expired', 'refunded', 'cancelled'] as const;

function thirtyDaysFromNow(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

interface PageProps {
  searchParams: Promise<{ status?: string; expiring?: string }>;
}

export default async function MembershipsAdminPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin/memberships');

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

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-xs font-mono text-accent hover:underline uppercase tracking-wider font-bold">
          ← Back to Dashboard
        </Link>
      </div>
      <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink">Memberships</h1>

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
        <p className="text-muted font-serif italic">No memberships match.</p>
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
