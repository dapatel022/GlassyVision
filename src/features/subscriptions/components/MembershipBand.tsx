import Image from 'next/image';
import Link from 'next/link';
import { getMembershipMath } from '@/lib/commerce/membership-math';

/** Homepage editorial band for membership. Fail closed: no math → no band. */
export default async function MembershipBand() {
  const math = await getMembershipMath();
  if (!math) return null;
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl bg-ink min-h-[420px] flex items-end">
        <Image
          src="/images/campaign_honey_tortoise.jpg"
          alt=""
          fill
          className="object-cover opacity-50"
          sizes="(min-width: 1280px) 1200px, 100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/50 to-transparent" aria-hidden="true" />
        <div className="relative p-8 sm:p-12 max-w-xl">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-amber-300">
            GlassyVision Membership
          </p>
          <h2 className="font-sans text-3xl sm:text-4xl font-black uppercase tracking-tight text-white mt-2">
            Frames from ${math.bestPerPair}/pair
          </h2>
          <p className="font-serif italic text-sm text-white/80 mt-3 leading-relaxed">
            One prepaid year. Up to three pairs — any frame, Rx or plano — instead of
            ${math.representativeFramePrice} a pair à la carte.
          </p>
          <Link
            href="/membership"
            className="inline-block mt-6 px-6 py-3 bg-white text-ink font-sans font-bold text-xs uppercase tracking-widest hover:bg-accent hover:text-white transition-colors motion-reduce:transition-none"
          >
            See the math →
          </Link>
        </div>
      </div>
    </section>
  );
}
