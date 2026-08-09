import type { Metadata } from 'next';
import Link from 'next/link';
import { getMembershipPricing } from '@/lib/commerce/membership-pricing';
import { getMembershipMath } from '@/lib/commerce/membership-math';
import { getLensUpgradePricing } from '@/lib/commerce/lens-pricing';
import { getCurrentCustomer } from '@/lib/auth/customer';
import { createAdminClient } from '@/lib/supabase/admin';
import MembershipTierTable from '@/features/subscriptions/components/MembershipTierTable';
import MembershipHero from '@/features/subscriptions/components/MembershipHero';
import MembershipSavingsCalculator from '@/features/subscriptions/components/MembershipSavingsCalculator';
import MembershipComparisonTable from '@/features/subscriptions/components/MembershipComparisonTable';
import MembershipHowItWorks from '@/features/subscriptions/components/MembershipHowItWorks';
import MembershipUpgrades from '@/features/subscriptions/components/MembershipUpgrades';
import MembershipStickyCTA from '@/features/subscriptions/components/MembershipStickyCTA';
import { buildUpgradeRows } from '@/features/subscriptions/lib/upgrade-rows';
import { buildComparison } from '@/features/subscriptions/lib/comparison-rows';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Membership · GlassyVision',
  description: 'Your year of eyewear, one price. 1, 2, or 3 pairs — any frame, Rx or plano, crafted in our lab.',
};

const FAQ: Array<[string, string]> = [
  ['How does redeeming a pair work?', 'Each pair is a slot in your account. Redeem a slot whenever you want: pick any frame, configure lenses, and we make it. Prescription pairs need an Rx upload — same as any Rx order.'],
  ['What about lens upgrades?', 'Progressives, photochromic, and tints are priced at redemption, per pair, at the same prices as the shop. You only pay for upgrades on pairs that use them.'],
  ['What happens at the end of my year?', 'Unused pairs expire at term end. We remind you at 60, 30, and 7 days — with a 14-day grace period after that. No auto-renew, no surprise charges: renewing is a fresh purchase.'],
  ['Can I get a refund?', 'Unredeemed value is refundable on a prorated basis — contact us from your account and an admin handles it directly.'],
  ['Where do you ship?', 'US and Canada. Prescription eyewear is dispensed under US/Canadian rules; other regions are coming later.'],
];

export default async function MembershipPage() {
  const [pricing, math, lensPricing] = await Promise.all([
    getMembershipPricing(),
    getMembershipMath(),
    getLensUpgradePricing(),
  ]);
  const comparison = buildComparison(pricing, math);
  const upgradeRows = buildUpgradeRows(lensPricing);

  // Signed-in members with an active membership see a pointer, not buy CTAs.
  let hasActiveMembership = false;
  try {
    const customer = await getCurrentCustomer();
    if (customer) {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('subscription_memberships')
        .select('id')
        .eq('customer_id', customer.id)
        .in('status', ['active', 'grace'])
        .maybeSingle();
      hasActiveMembership = !!data;
    }
  } catch {
    hasActiveMembership = false; // signed-out or auth hiccup → show normal page
  }

  return (
    <div>
      <MembershipHero />
      <MembershipStickyCTA show={!hasActiveMembership} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-16">
        {hasActiveMembership && (
          <div className="p-4 border border-accent bg-accent/5 rounded-xl">
            <p className="text-sm text-ink font-bold">You already have an active membership.</p>
            <Link href="/account/subscription" className="text-sm text-accent underline">
              Manage your pairs &amp; redeem slots →
            </Link>
          </div>
        )}

        {math && <MembershipSavingsCalculator math={math} />}

        <div id="tiers">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-soft border-b border-line pb-2 mb-6">
            Pick your year
          </h2>
          <MembershipTierTable pricing={pricing} canBuy={!hasActiveMembership} />
        </div>

        {comparison && <MembershipComparisonTable columns={comparison} />}

        <MembershipHowItWorks />

        <MembershipUpgrades rows={upgradeRows} />

        <section aria-label="Membership FAQ">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-soft border-b border-line pb-2">
            Questions, answered
          </h2>
          <div className="divide-y divide-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="py-3 group">
                <summary className="font-sans font-bold text-sm text-ink cursor-pointer list-none flex justify-between items-center">
                  {q}
                  <span aria-hidden="true" className="font-mono text-muted-soft group-open:rotate-45 transition-transform motion-reduce:transition-none">+</span>
                </summary>
                <p className="text-sm text-muted mt-2 max-w-2xl">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
