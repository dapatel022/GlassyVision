import Link from 'next/link';

export const metadata = {
  title: 'Our Story — GlassyVision',
  description: 'The Manifesto of Slow Eyewear and our journey of limited-batch craftsmanship.',
};

const MILESTONES = [
  {
    year: '2024',
    title: 'The Blueprint',
    subtitle: 'Syracuse, NY',
    description: 'Frustrated by the monopoly-dominated, mass-produced eyewear market, we set out to build something distinct. Our vision was simple: return to high-integrity materials, human-scale production, and complete design transparency.'
  },
  {
    year: '2025',
    title: 'The Indian Workshop Partner',
    subtitle: 'Hand-Finishing Collective',
    description: 'We spent months searching for makers who still value manual patience. We partnered with a small workshop in India, where multi-generational artisans tumble, buff, and assemble frames individually on vintage optometric benches.'
  },
  {
    year: '2026',
    title: 'Drop N° 01 Release',
    subtitle: 'Limited Allocations',
    description: 'We launch our first four archetype frames: Archetype, Linear, Voyager, and Editor. Hand-tumbled for 72 hours, limited to 500 numbered pieces per run, and glazed to order.'
  }
];

export default function StoryPage() {
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-16 animate-fade-in">
      {/* Editorial Header */}
      <header className="max-w-2xl space-y-6">
        <p className="text-xs font-mono font-bold uppercase tracking-[4px] text-accent">Our Origins</p>
        <h1 className="font-sans text-5xl sm:text-7xl font-black tracking-tighter uppercase text-ink leading-[0.85]">
          Manifesto of<br />Slow Eyewear<span className="text-accent">.</span>
        </h1>
        <p className="font-serif italic text-muted text-base leading-relaxed">
          We believe that objects of daily utility should be built with architectural integrity. No rushed margins. No synthetic shortcuts. Just patience.
        </p>
      </header>

      {/* Brand Values Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-b border-line py-12">
        <div className="space-y-2">
          <span className="font-mono text-xs font-bold text-accent">I. RECLAIMING PATIENCE</span>
          <h3 className="font-sans font-black text-lg uppercase text-ink">72-Hour Tumble</h3>
          <p className="font-serif text-sm text-muted leading-relaxed">
            We reject the rapid heat-polishing of industrial plastics. Our frames spend 3 full days inside oak barrels filled with white pumice stones and wood chips to achieve a natural, rich sheen.
          </p>
        </div>
        <div className="space-y-2">
          <span className="font-mono text-xs font-bold text-accent">II. GENUINE HARDWARE</span>
          <h3 className="font-sans font-black text-lg uppercase text-ink">Riveted Hinges</h3>
          <p className="font-serif text-sm text-muted leading-relaxed">
            No glue or heat-sinking. We drive metal pins straight through the acetate to lock our 5-barrel hinges. The horizontal rivets on our temples are a guarantee of durability.
          </p>
        </div>
        <div className="space-y-2">
          <span className="font-mono text-xs font-bold text-accent">III. ZERO STOCK WASTAGE</span>
          <h3 className="font-sans font-black text-lg uppercase text-ink">Made to Order</h3>
          <p className="font-serif text-sm text-muted leading-relaxed">
            By producing in batches of 500 and hand-glazing lenses per prescription on-site, we prevent warehouses of unsold frames from ending up in landfills.
          </p>
        </div>
      </section>

      {/* Dynamic Milestones Timeline */}
      <section className="space-y-12">
        <div className="text-center md:text-left">
          <p className="text-[10px] font-mono font-bold tracking-widest text-muted-soft uppercase">Artisan Journey</p>
          <h2 className="font-sans text-3xl font-black uppercase text-ink tracking-tight">Timeline of Milestones</h2>
        </div>

        <div className="relative border-l border-line pl-6 ml-4 space-y-12">
          {MILESTONES.map((m) => (
            <div key={m.year} className="relative group">
              {/* Timeline Indicator dot */}
              <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 border-accent bg-white group-hover:bg-accent transition-all duration-300 shadow-sm" />
              
              <div className="space-y-2">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-2xl font-black text-accent">{m.year}</span>
                  <h3 className="font-sans font-bold text-base text-ink uppercase tracking-wide">
                    {m.title}
                  </h3>
                </div>
                <p className="font-mono text-[9px] uppercase tracking-wider text-muted-soft">
                  {m.subtitle}
                </p>
                <p className="font-serif text-sm text-muted leading-relaxed max-w-2xl">
                  {m.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Story Footer Join CTA */}
      <footer className="border-t border-line pt-12 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-1">
          <h3 className="font-sans font-black text-lg uppercase tracking-tight text-ink">Support Independent Optics</h3>
          <p className="font-serif italic text-sm text-muted">Join us in slowing down the everyday object.</p>
        </div>
        <Link
          href="/shop"
          className="px-6 py-3 bg-accent text-white font-sans font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-accent-light transition"
        >
          View Collection
        </Link>
      </footer>
    </article>
  );
}
