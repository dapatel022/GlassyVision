import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface Stat {
  label: string;
  value: number;
  href: string;
}

async function getStats(): Promise<Stat[]> {
  const supabase = createAdminClient();

  const [allRxFiles, reviewedFileIds, lowStock, openReturns, ordersAwaitingRx, activeDrops, activeLabJobs] = await Promise.all([
    supabase.from('rx_files').select('id').is('deleted_at', null),
    supabase.from('rx_reviews').select('rx_file_id'),
    supabase.from('inventory_pool').select('id, pool_quantity, threshold_alert'),
    supabase.from('returns').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('rx_status', 'awaiting_upload'),
    supabase.from('drops').select('id', { count: 'exact', head: true }).eq('state', 'live'),
    supabase.from('lab_jobs').select('id', { count: 'exact', head: true }).neq('column', 'ship'),
  ]);

  const reviewedSet = new Set((reviewedFileIds.data ?? []).map((r) => r.rx_file_id));
  const pendingRxCount = (allRxFiles.data ?? []).filter((f) => !reviewedSet.has(f.id)).length;
  const lowStockCount = (lowStock.data ?? []).filter(
    (p) => p.pool_quantity <= p.threshold_alert,
  ).length;

  return [
    { label: 'Rx awaiting review', value: pendingRxCount, href: '/admin/rx-queue' },
    { label: 'Orders awaiting Rx upload', value: ordersAwaitingRx.count ?? 0, href: '/admin/rx-queue' },
    { label: 'Open returns', value: openReturns.count ?? 0, href: '/admin/returns' },
    { label: 'Active drops', value: activeDrops.count ?? 0, href: '/admin/drops' },
    { label: 'Low-stock SKUs', value: lowStockCount, href: '/admin/inventory' },
    { label: 'Lab jobs in progress', value: activeLabJobs.count ?? 0, href: '/lab' },
  ];
}

const SECTIONS: { title: string; description: string; href: string }[] = [
  { title: 'Rx queue', description: 'Review uploaded prescriptions. Approve or reject.', href: '/admin/rx-queue' },
  { title: 'Drops', description: 'Manage limited-release product drops.', href: '/admin/drops' },
  { title: 'Inventory', description: 'Frame stock pools and reorder thresholds.', href: '/admin/inventory' },
  { title: 'Returns', description: 'Customer return + exchange requests.', href: '/admin/returns' },
  { title: 'Team', description: 'Invite reviewers, lab staff, and admins.', href: '/admin/team' },
  { title: 'Lab kanban', description: 'See work in progress across the 6 stages.', href: '/lab' },
];

export default async function AdminDashboard() {
  const stats = await getStats().catch(() => [] as Stat[]);

  return (
    <div className="space-y-12">
      <header>
        <h1 className="font-sans text-3xl font-black tracking-tight uppercase text-ink mb-2">
          Admin Dashboard
        </h1>
        <p className="font-serif italic text-muted">
          What needs your attention right now.
        </p>
      </header>

      {stats.length > 0 && (
        <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="block p-6 bg-white border border-line hover:border-accent hover:shadow-sm transition rounded-lg"
            >
              <div className="font-sans font-black text-4xl text-ink tabular-nums">
                {s.value}
              </div>
              <div className="font-mono text-xs uppercase tracking-wider text-muted mt-2">
                {s.label}
              </div>
            </Link>
          ))}
        </section>
      )}

      <section>
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-soft mb-4">
          Sections
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="block p-6 bg-white border border-line hover:border-accent transition rounded-lg group"
            >
              <h3 className="font-sans text-xl font-black tracking-tight uppercase text-ink group-hover:text-accent transition">
                {s.title}
              </h3>
              <p className="font-serif italic text-muted text-sm mt-2">
                {s.description}
              </p>
              <span className="font-mono text-xs uppercase tracking-wider text-accent mt-4 inline-block">
                Open →
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
