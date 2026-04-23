import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/middleware';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function DropsAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin/drops');

  const supabase = createAdminClient();
  const { data: drops } = await supabase
    .from('drops')
    .select('id, slug, name, number, state, starts_at, sold_count, total_capacity')
    .order('number', { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink">Drops</h1>
        <Link
          href="/admin/drops/new"
          className="px-4 py-2 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light"
        >
          New drop
        </Link>
      </div>

      {(drops ?? []).length === 0 ? (
        <p className="text-muted font-serif italic">No drops yet.</p>
      ) : (
        <div className="space-y-2">
          {(drops ?? []).map((d) => (
            <Link
              key={d.id}
              href={`/admin/drops/${d.slug}`}
              className="block p-4 border border-line rounded-xl bg-white hover:border-accent"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono text-muted-soft">Drop Nº {String(d.number).padStart(2, '0')}</p>
                  <p className="font-sans font-bold text-ink">{d.name}</p>
                  <p className="text-xs text-muted mt-1">
                    {d.state} · {new Date(d.starts_at).toLocaleDateString()} · {d.sold_count}
                    {d.total_capacity ? ` / ${d.total_capacity}` : ''} sold
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
