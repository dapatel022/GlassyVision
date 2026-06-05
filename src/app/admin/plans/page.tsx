import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/middleware';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function PlansAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin/plans');

  const supabase = createAdminClient();
  const { data: plans } = await supabase
    .from('subscription_plans')
    .select('id, name, pairs_count, term_months, status, end_of_term_policy, created_at')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-xs font-mono text-accent hover:underline uppercase tracking-wider font-bold">
          ← Back to Dashboard
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink">Subscription plans</h1>
        <Link
          href="/admin/plans/new"
          className="px-4 py-2 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light"
        >
          New plan
        </Link>
      </div>

      {(plans ?? []).length === 0 ? (
        <p className="text-muted font-serif italic">No plans yet.</p>
      ) : (
        <div className="space-y-2">
          {(plans ?? []).map((p) => {
            const eot = (p.end_of_term_policy as { mode?: string } | null)?.mode ?? '—';
            return (
              <Link
                key={p.id}
                href={`/admin/plans/${p.id}`}
                className="block p-4 border border-line rounded-xl bg-white hover:border-accent"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-sans font-bold text-ink">{p.name}</p>
                    <p className="text-xs text-muted mt-1 font-mono">
                      {p.pairs_count} pairs · {p.term_months} mo · end-of-term: {eot} · {p.status}
                    </p>
                  </div>
                  <span className="text-xs text-muted">→</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
