import type { Metadata } from 'next';
import Link from 'next/link';
import { getMembershipPricing } from '@/lib/commerce/membership-pricing';
import { getCurrentCustomer } from '@/lib/auth/customer';
import { createAdminClient } from '@/lib/supabase/admin';
import MembershipTierTable from '@/features/subscriptions/components/MembershipTierTable';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Membership · GlassyVision',
  description: 'One prepaid membership. Your year of frames — 1, 2, or 3 pairs, any frame, Rx or plano.',
};

const FAQ: Array<[string, string]> = [
  ['How does redeeming a pair work?', 'Each pair is a slot in your account. Redeem a slot whenever you want: pick any frame, configure lenses, and we make it. Prescription pairs need an Rx upload — same as any Rx order.'],
  ['What about lens upgrades?', 'Progressives, photochromic, and tints are priced at redemption, per pair, at the same prices as the shop. You only pay for upgrades on pairs that use them.'],
  ['What happens at the end of my year?', 'Unused pairs expire at term end. We remind you at 60, 30, and 7 days — with a 14-day grace period after that. No auto-renew, no surprise charges: renewing is a fresh purchase.'],
  ['Can I get a refund?', 'Unredeemed value is refundable on a prorated basis — contact us from your account and an admin handles it directly.'],
  ['Where do you ship?', 'US and Canada. Prescription eyewear is dispensed under US/Canadian rules; other regions are coming later.'],
];

export default async function MembershipPage() {
  const pricing = await getMembershipPricing();

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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <header>
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-soft">
          Annual membership · Prepaid · US + Canada
        </p>
        <h1 className="font-sans text-4xl sm:text-5xl font-black tracking-tight uppercase text-ink mt-2">
          One membership.<br />Your year of frames.
        </h1>
        <p className="font-mono text-7xl sm:text-8xl font-black text-ink/10 mt-6 select-none" aria-hidden="true">
          1× 2× 3×
        </p>
      </header>

      {hasActiveMembership && (
        <div className="mt-8 p-4 border border-accent bg-accent/5 rounded-xl">
          <p className="text-sm text-ink font-bold">You already have an active membership.</p>
          <Link href="/account/subscription" className="text-sm text-accent underline">
            Manage your pairs & redeem slots →
          </Link>
        </div>
      )}

      {/* 3-Pair Eye Wardrobe Visual Section */}
      <section className="mt-12 bg-gradient-to-tr from-accent/5 via-white to-base border border-line rounded-3xl p-8 space-y-6 shadow-sm">
        <div className="max-w-xl space-y-2">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[3px] text-accent">
            The GlassyVision Eye Wardrobe
          </span>
          <h2 className="font-sans text-2xl sm:text-3xl font-black uppercase text-ink tracking-tight">
            One Pass. Complete Eyewear Rotation.
          </h2>
          <p className="font-serif italic text-sm text-muted leading-relaxed">
            Instead of paying $250+ per single pair, your membership covers your complete 3-pair annual rotation. Redeem anytime during your 12-month term.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          <div className="bg-white/80 backdrop-blur border border-line rounded-2xl p-5 space-y-2 shadow-2xs">
            <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center font-mono text-xs font-bold text-accent">
              01
            </div>
            <h3 className="font-sans font-black text-sm uppercase text-ink">Daily Rx Optical</h3>
            <p className="font-serif italic text-xs text-muted leading-relaxed">
              Your primary prescription driver. Hand-finished acetate or ultra-light titanium with anti-reflective Single Vision Rx lenses.
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur border border-line rounded-2xl p-5 space-y-2 shadow-2xs">
            <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center font-mono text-xs font-bold text-accent">
              02
            </div>
            <h3 className="font-sans font-black text-sm uppercase text-ink">Polarized Sun Aviator</h3>
            <p className="font-serif italic text-xs text-muted leading-relaxed">
              Outdoor UV & glare protection. 18k gold-plated or dark gunmetal sunglasses with dark green polarized optics.
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur border border-line rounded-2xl p-5 space-y-2 shadow-2xs">
            <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center font-mono text-xs font-bold text-accent">
              03
            </div>
            <h3 className="font-sans font-black text-sm uppercase text-ink">Blue-Light Digital Frame</h3>
            <p className="font-serif italic text-xs text-muted leading-relaxed">
              Built for deep focus. Custom blue-light filtering lenses to eliminate eye fatigue during long screen sessions.
            </p>
          </div>
        </div>
      </section>

      {/* Surcharge Upgrade Transparency Table */}
      <section className="mt-12 bg-white border border-line rounded-3xl p-8 space-y-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-4">
          <div>
            <span className="font-mono text-[9px] font-bold uppercase tracking-[3px] text-accent">
              Fair & Transparent Upgrades
            </span>
            <h3 className="font-sans text-xl font-black uppercase text-ink tracking-tight">
              Included vs Optional Upgrades
            </h3>
          </div>
          <span className="font-mono text-xs font-bold text-muted-soft">
            Pay upgrades only on pairs that use them
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <p className="font-mono text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-2">
              <span>✓</span> INCLUDED IN YOUR MEMBERSHIP
            </p>
            <ul className="space-y-2 font-serif italic text-xs text-ink/80 divide-y divide-line/60">
              <li className="pt-2 flex justify-between"><span>Any Active Collection Frame (Acetate/Titanium)</span><strong className="font-mono text-ink">COVERED</strong></li>
              <li className="pt-2 flex justify-between"><span>Standard Single Vision Prescription Optics</span><strong className="font-mono text-ink">COVERED</strong></li>
              <li className="pt-2 flex justify-between"><span>Non-Rx Plano & Blue Light Protection</span><strong className="font-mono text-ink">COVERED</strong></li>
              <li className="pt-2 flex justify-between"><span>Hardfold Leather Case & Microfiber Cloth</span><strong className="font-mono text-ink">COVERED</strong></li>
            </ul>
          </div>

          <div className="space-y-3">
            <p className="font-mono text-xs font-bold uppercase tracking-wider text-muted-soft flex items-center gap-2">
              <span>+</span> OPTIONAL LENS & FRAME SURCHARGES
            </p>
            <ul className="space-y-2 font-mono text-xs text-ink divide-y divide-line/60">
              <li className="pt-2 flex justify-between"><span>High-Index 1.67 Lenses (Ultra-Thin Rx)</span><strong className="text-accent">+$30 USD</strong></li>
              <li className="pt-2 flex justify-between"><span>Transitions / Photochromic Sun Optics</span><strong className="text-accent">+$45 USD</strong></li>
              <li className="pt-2 flex justify-between"><span>Polarized Sun Lens Upgrade</span><strong className="text-accent">+$35 USD</strong></li>
              <li className="pt-2 flex justify-between"><span>Premium Limited Titanium Edition Frame</span><strong className="text-accent">+$40 USD</strong></li>
            </ul>
          </div>
        </div>
      </section>

      <div className="mt-12">
        <MembershipTierTable pricing={pricing} canBuy={!hasActiveMembership} />
      </div>

      <section className="mt-16" aria-label="Membership FAQ">
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
  );
}
