import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth/customer';
import { createAdminClient } from '@/lib/supabase/admin';
import { deriveSlotState, type SlotState } from '@/features/subscriptions/lib/slot-state';
import type { Database } from '@/lib/supabase/types';

// Slot chip treatment per visual state (tech-minimal: mono chips, one accent).
const STATE_CHIP: Record<SlotState, { label: string; className: string }> = {
  available: { label: 'AVAILABLE', className: 'bg-accent text-white' },
  awaiting_rx: { label: 'AWAITING RX', className: 'bg-amber-100 text-amber-900 border border-amber-300' },
  in_production: { label: 'IN PRODUCTION', className: 'bg-base-deeper text-ink border border-line' },
  shipped: { label: 'SHIPPED', className: 'bg-success text-white' },
  reserved: { label: 'RESERVED', className: 'bg-base-deeper text-muted border border-line' },
  expired: { label: 'EXPIRED', className: 'bg-base-deeper text-muted-soft border border-line' },
};

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
            <p className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-accent">Your membership</p>
            <h1 className="font-sans text-2xl font-black uppercase text-ink mt-1">Subscription</h1>
            <p className="text-sm text-muted mt-1">{customer.email}</p>
          </header>
          <section className="border border-dashed border-line bg-white p-12 text-center">
            <p className="font-serif italic text-muted">You don&apos;t have an active membership.</p>
            <p className="text-sm text-muted mt-2">1, 2, or 3 pairs a year — from $63 a pair.</p>
            <Link href="/membership" className="inline-block mt-4 text-accent underline">
              See membership tiers →
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
            <p className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-accent">Your membership</p>
            <h1 className="font-sans text-2xl font-black uppercase text-ink mt-1">Subscription</h1>
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

        <section>
          <h2 className="font-sans text-sm font-bold uppercase tracking-widest text-ink border-b border-line pb-2 mb-4">Your pairs</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {redemptions.map((r) => {
              const state = deriveSlotState(r, membership.status);
              const chip = STATE_CHIP[state];
              const redeemable = state === 'available' && isUnlocked(r.unlocks_at);
              return (
                <div key={r.id} className="bg-white border border-line rounded-2xl p-5 shadow-sm flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-xs font-bold tracking-widest text-muted-soft">
                      SLOT {String(r.slot_index + 1).padStart(2, '0')}
                    </p>
                    <span className={`font-mono text-[10px] font-bold tracking-widest px-2 py-1 ${chip.className}`}>
                      {chip.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted flex-1">
                    {STATUS_LABEL[r.status] ?? r.status}
                    {state === 'shipped' && ' — tracking details are in your shipping email.'}
                  </p>
                  {redeemable ? (
                    <Link
                      href={`/account/subscription/redeem/${r.id}`}
                      className="block text-center px-4 py-2.5 bg-ink text-white font-sans font-bold text-xs tracking-widest uppercase hover:bg-accent transition-colors"
                    >
                      Redeem this pair
                    </Link>
                  ) : state === 'available' ? (
                    <span className="text-xs font-mono text-muted-soft uppercase">
                      Unlocks {new Date(r.unlocks_at).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
