import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/middleware';
import { createAdminClient } from '@/lib/supabase/admin';
import MembershipActions from '@/features/admin/memberships/components/MembershipActions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

function daysBetween(target: string): number {
  return Math.ceil((new Date(target).getTime() - Date.now()) / 86_400_000);
}

export default async function MembershipDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: membership } = await supabase
    .from('subscription_memberships')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!membership) notFound();

  const [{ data: redemptions }, { data: plan }] = await Promise.all([
    supabase
      .from('subscription_redemptions')
      .select('id, slot_index, status, unlocks_at, add_on_shopify_order_id, internal_order_id, work_order_id, redeemed_at')
      .eq('membership_id', id)
      .order('slot_index', { ascending: true }),
    supabase.from('subscription_plans').select('name').eq('id', membership.plan_id).maybeSingle(),
  ]);

  const countdown = daysBetween(membership.term_end);
  const eot = (membership.end_of_term_policy as { mode?: string } | null)?.mode ?? '—';

  const row = 'flex justify-between py-1 border-b border-line/50 text-sm';

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/admin/memberships" className="text-xs font-mono text-accent hover:underline uppercase tracking-wider font-bold">
          ← Back to Memberships
        </Link>
      </div>

      <header className="flex items-center justify-between">
        <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink">Membership</h1>
        <span className="font-mono text-xs uppercase tracking-wider px-3 py-1 rounded-full bg-ink text-white">
          {membership.status}
        </span>
      </header>

      <section className="p-6 border border-line rounded-xl bg-white">
        <h2 className="font-sans text-sm font-black uppercase tracking-wider text-ink mb-3">Frozen terms</h2>
        <div className="font-mono">
          <div className={row}><span className="text-muted">Membership id</span><span>{membership.id}</span></div>
          <div className={row}><span className="text-muted">Plan</span><span>{plan?.name ?? membership.plan_id}</span></div>
          <div className={row}><span className="text-muted">Pairs total</span><span>{membership.pairs_total}</span></div>
          <div className={row}><span className="text-muted">Currency</span><span>{membership.currency}</span></div>
          <div className={row}><span className="text-muted">Term start</span><span>{new Date(membership.term_start).toLocaleDateString()}</span></div>
          <div className={row}><span className="text-muted">Term end</span><span>{new Date(membership.term_end).toLocaleDateString()}</span></div>
          <div className={row}>
            <span className="text-muted">Countdown</span>
            <span className={countdown < 0 ? 'text-error' : ''}>
              {countdown < 0 ? `${Math.abs(countdown)}d past term` : `${countdown}d left`}
            </span>
          </div>
          <div className={row}><span className="text-muted">End-of-term mode</span><span>{eot}</span></div>
          <div className={row}><span className="text-muted">Rollover count</span><span>{membership.rollover_count}</span></div>
          <div className={row}><span className="text-muted">Shopify order</span><span>{membership.shopify_order_id}</span></div>
          {membership.cancelled_at && (
            <div className={row}><span className="text-muted">Cancelled</span><span>{new Date(membership.cancelled_at).toLocaleDateString()} — {membership.cancel_reason}</span></div>
          )}
        </div>
      </section>

      <section className="p-6 border border-line rounded-xl bg-white">
        <h2 className="font-sans text-sm font-black uppercase tracking-wider text-ink mb-3">Slots</h2>
        {(redemptions ?? []).length === 0 ? (
          <p className="text-muted font-serif italic text-sm">No slots.</p>
        ) : (
          <div className="space-y-2">
            {(redemptions ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm font-mono p-2 border border-line/60 rounded-lg">
                <span>Slot #{r.slot_index}</span>
                <span className="uppercase tracking-wider text-muted">{r.status}</span>
                <span className="text-muted-soft text-xs">
                  {r.internal_order_id ? `order ${r.internal_order_id.slice(0, 8)}` : 'no order'}
                  {r.work_order_id ? ` · WO ${r.work_order_id.slice(0, 8)}` : ''}
                  {r.add_on_shopify_order_id ? ` · add-on ${r.add_on_shopify_order_id}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <MembershipActions membershipId={membership.id} status={membership.status} />
    </div>
  );
}
