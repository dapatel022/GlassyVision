import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth/customer';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/types';

export const metadata = { title: 'Subscription' };
export const dynamic = 'force-dynamic';

type RedemptionRow = Database['public']['Tables']['subscription_redemptions']['Row'];
type RedemptionStatus = Database['public']['Enums']['redemption_status'];

// Human-readable label for each in-flight / terminal redemption state. The
// /track stepper is keyed on order rows + shopify_order_number, not redemption
// statuses, so it is not cleanly reusable here — we render a simple status line.
const STATUS_LABEL: Record<RedemptionStatus, string> = {
  available: 'Ready to use',
  locked: 'Reserving…',
  pending_payment: 'Awaiting upgrade payment',
  awaiting_rx: 'Awaiting your prescription',
  awaiting_fulfillment: 'Being prepared',
  in_review: 'Prescription in review',
  in_production: 'In production at the lab',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  expired: 'Expired',
  rx_rejected: 'Prescription needs attention',
};

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function isUnlocked(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now();
}

export default async function SubscriptionDashboardPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/account/login?next=/account/subscription');

  const supabase = createAdminClient();

  // AUTHZ: the service-role admin client bypasses RLS, so the
  // `.eq('customer_id', customer.id)` filter below IS the authorization — it
  // scopes every read to the signed-in customer's own membership/redemptions.
  const { data: membership } = await supabase
    .from('subscription_memberships')
    .select('id, status, term_end, pairs_total')
    .eq('customer_id', customer.id)
    .in('status', ['active', 'grace'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return (
      <main className="min-h-screen bg-base px-6 py-16">
        <div className="max-w-2xl mx-auto space-y-8">
          <header>
            <h1 className="font-sans text-2xl font-black uppercase text-ink">Subscription</h1>
            <p className="text-sm text-muted mt-1">{customer.email}</p>
          </header>
          <section className="border border-dashed border-line bg-white p-12 text-center">
            <p className="font-serif italic text-muted">You don&apos;t have an active subscription.</p>
            <Link href="/shop" className="inline-block mt-4 text-accent underline">
              Browse subscriptions →
            </Link>
          </section>
          <Link href="/account" className="inline-block text-xs font-mono text-muted underline">
            ← Back to account
          </Link>
        </div>
      </main>
    );
  }

  const { data: redemptionsData } = await supabase
    .from('subscription_redemptions')
    .select('*')
    .eq('membership_id', membership.id)
    .order('slot_index', { ascending: true });

  const redemptions = (redemptionsData ?? []) as RedemptionRow[];
  const remaining = daysUntil(membership.term_end);

  return (
    <main className="min-h-screen bg-base px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="flex items-baseline justify-between">
          <div>
            <h1 className="font-sans text-2xl font-black uppercase text-ink">Subscription</h1>
            <p className="text-sm text-muted mt-1">{customer.email}</p>
          </div>
          <Link href="/account" className="text-xs font-mono text-muted underline">
            ← Account
          </Link>
        </header>

        <section className="border border-line bg-white p-6 flex items-center justify-between">
          <div>
            <h2 className="font-sans text-sm font-bold uppercase tracking-widest text-ink">
              GlassyVision Annual
            </h2>
            <p className="text-sm text-muted mt-1 capitalize">Status: {membership.status}</p>
          </div>
          <div className="text-right">
            <p className="font-sans text-2xl font-black text-ink">{remaining}</p>
            <p className="text-xs font-mono uppercase tracking-widest text-muted-soft">days left</p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-sans text-sm font-bold uppercase tracking-widest text-ink">Your pairs</h2>
          {redemptions.map((r) => {
            const isAvailable = r.status === 'available' && isUnlocked(r.unlocks_at);
            return (
              <div key={r.id} className="border border-line bg-white p-5 flex items-center justify-between">
                <div>
                  <p className="font-sans font-bold text-sm uppercase tracking-wider text-ink">
                    Pair {r.slot_index + 1}
                  </p>
                  <p className="text-sm text-muted mt-1">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </p>
                  {r.status === 'shipped' && (
                    <p className="text-xs font-mono text-muted-soft mt-1">
                      On its way — tracking details are in your shipping email.
                    </p>
                  )}
                </div>
                {isAvailable ? (
                  <Link
                    href={`/account/subscription/redeem/${r.id}`}
                    className="px-4 py-2 bg-ink text-base font-sans font-bold text-xs tracking-widest uppercase"
                  >
                    Use a pair
                  </Link>
                ) : r.status === 'available' ? (
                  <span className="text-xs font-mono text-muted-soft uppercase">
                    Unlocks {new Date(r.unlocks_at).toLocaleDateString()}
                  </span>
                ) : null}
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
