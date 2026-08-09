import Image from 'next/image';
import Link from 'next/link';

/** Full-bleed dark editorial hero. No numbers here — numbers are live-only. */
export default function MembershipHero() {
  return (
    <section className="relative min-h-[70vh] flex items-end overflow-hidden bg-ink">
      <Image
        src="/images/campaign_black_titanium.jpg"
        alt=""
        fill
        priority
        className="object-cover opacity-60"
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" aria-hidden="true" />
      <div className="relative max-w-5xl mx-auto w-full px-4 sm:px-6 pb-16 pt-40">
        <p className="font-mono text-xs font-bold uppercase tracking-[3px] text-white/70">
          Annual membership · Prepaid · US + Canada
        </p>
        <h1 className="font-sans text-5xl sm:text-7xl font-black tracking-tight uppercase text-white mt-3 max-w-3xl">
          Your year of eyewear. One price.
        </h1>
        <p className="font-serif italic text-base text-white/80 mt-4 max-w-xl leading-relaxed">
          One, two, or three pairs a year — any frame in the catalog, Rx or plano,
          crafted in our lab and shipped to your door.
        </p>
        <Link
          href="#tiers"
          className="inline-block mt-8 px-8 py-4 bg-white text-ink font-sans font-bold text-xs uppercase tracking-widest hover:bg-accent hover:text-white transition-colors motion-reduce:transition-none"
        >
          Choose your tier ↓
        </Link>
      </div>
    </section>
  );
}
