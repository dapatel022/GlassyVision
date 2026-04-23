import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/middleware';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function ReturnsQueuePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin/returns');

  const supabase = createAdminClient();
  const { data: returns } = await supabase
    .from('returns')
    .select('id, rma_number, customer_email, reason, request_type, status, admin_decision, created_at, order_id')
    .order('created_at', { ascending: false })
    .limit(100);

  const pending = (returns ?? []).filter((r) => r.status === 'pending');
  const recent = (returns ?? []).filter((r) => r.status !== 'pending');

  return (
    <div>
      <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-6">Returns queue</h1>

      <section className="mb-10">
        <h2 className="font-sans font-bold text-sm uppercase tracking-wider text-muted-soft mb-3">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-muted font-serif italic">No pending returns.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((r) => (
              <Link
                key={r.id}
                href={`/admin/returns/${r.id}`}
                className="block p-4 border border-line rounded-xl bg-white hover:border-accent"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm font-bold text-accent">{r.rma_number}</p>
                    <p className="text-xs text-muted mt-1">{r.customer_email} · {r.reason.replace(/_/g, ' ')} · {r.request_type}</p>
                  </div>
                  <p className="text-xs font-mono text-muted-soft">
                    {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-sans font-bold text-sm uppercase tracking-wider text-muted-soft mb-3">Recent decisions</h2>
        {recent.length === 0 ? (
          <p className="text-muted font-serif italic text-sm">None yet.</p>
        ) : (
          <div className="space-y-2">
            {recent.slice(0, 20).map((r) => (
              <Link
                key={r.id}
                href={`/admin/returns/${r.id}`}
                className="block p-3 border border-line rounded-lg bg-white hover:border-accent text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono">{r.rma_number}</span>
                  <span className="text-xs text-muted">{r.admin_decision.replace(/_/g, ' ')} · {r.status}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
