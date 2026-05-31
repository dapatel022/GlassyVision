import Link from 'next/link';

export const metadata = {
  title: 'Made in India — The Craftsmanship Journal',
  description: 'Inside the workshop: from organic acetate blocks to hand-finished limited drops.',
};

const STAGES = [
  {
    step: '01',
    title: 'Cellulose Sculpting',
    subtitle: 'Block Milling',
    description: 'We carve the profiles from organic cellulose acetate sheets—milled from cotton fibers and wood pulp, rather than fossil oils. This makes the frame hypoallergenic, warm to the touch, and biodegradable.'
  },
  {
    step: '02',
    title: 'Wood Chip Tumbling',
    subtitle: '72-Hour Barrel Smooth',
    description: 'Freshly cut acetate frames have sharp, raw edges. We tumble them for three days inside rotating oak wood barrels loaded with organic birchwood chips, white pumice stone powder, and natural polishing pastes.'
  },
  {
    step: '03',
    title: '5-Barrel Hinge Riveting',
    subtitle: 'Hand-Riveted Core',
    description: 'We avoid heat-stamping. Instead, we use a traditional hammer-rivet process: driving genuine silver dual-pins directly through the temple acetate to anchor custom 5-barrel hinges. The result is virtually indestructible.'
  },
  {
    step: '04',
    title: 'Cotton Wheel Buffing',
    subtitle: 'High-Gloss Luster',
    description: 'Each frame is polished individually by a master craftsperson on spinning cotton wheels with custom compound wax pastes. This brings out the deep depth of the tortoise patterns and creates our signature mirror shine.'
  },
  {
    step: '05',
    title: 'Bench Glazing',
    subtitle: 'Lab Calibration',
    description: 'Lenses are cut, beveled, and snapped into the frame, then QC-checked. Technicians lock in correct pupillary distance (PD) offsets and align prescription cylinder axes with precision.'
  }
];

export default function MadeInIndiaPage() {
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-16">
      
      {/* Editorial Header */}
      <header className="max-w-2xl">
        <p className="text-xs font-mono font-bold uppercase tracking-[4px] text-accent mb-2">The Production Journal</p>
        <h1 className="font-sans text-5xl sm:text-7xl font-black tracking-tighter uppercase text-ink leading-[0.85] mb-6">
          Finished<br />By Hand<span className="text-accent">.</span>
        </h1>
        <p className="font-serif italic text-muted text-base leading-relaxed">
          GlassyVision frames are designed in Syracuse and hand-finished in a small boutique workshop in India. We skip mass factories to focus on manual detail.
        </p>
      </header>

      {/* Hero Workshop Quote */}
      <div className="bg-ink text-white p-8 rounded-2xl border border-line flex flex-col md:flex-row items-center gap-8">
        <div className="flex-1 space-y-2">
          <p className="font-mono text-[9px] uppercase tracking-widest text-accent font-bold">WORKSHOP BENCHNOTE</p>
          <h3 className="font-sans font-black text-2xl uppercase tracking-tight">One Bench. One Craftsman.</h3>
          <p className="font-serif italic text-sm text-muted-soft leading-relaxed">
            By avoiding large automated conveyor assembly systems, we keep errors to zero. A single operator owns the frame tumbling, buffing, and QC from block to box.
          </p>
        </div>
        <div className="flex-none bg-white/5 border border-white/10 rounded-xl p-4 font-mono text-[10px] text-accent">
          <p className="font-bold">CAPACITY STATS:</p>
          <p className="text-white mt-1">Allocation: 500 pcs</p>
          <p className="text-white">Tumble: 72 hours</p>
          <p className="text-white">QC Steps: 4 checkmarks</p>
        </div>
      </div>

      {/* Vertical Timeline Stages */}
      <section className="space-y-12 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-[1px] before:bg-line">
        {STAGES.map((s) => (
          <div key={s.step} className="flex gap-8 relative">
            {/* Step circle bullet */}
            <div className="flex-none w-8 h-8 rounded-full bg-white border border-accent flex items-center justify-center font-mono text-xs font-bold text-accent shadow-sm z-10">
              {s.step}
            </div>

            {/* Content card */}
            <div className="flex-1 bg-white border border-line rounded-2xl p-6 shadow-sm space-y-2 hover:border-accent transition-all duration-300">
              <span className="font-mono text-[9px] font-bold uppercase text-accent tracking-wider">
                {s.subtitle}
              </span>
              <h2 className="font-sans text-xl font-black uppercase text-ink tracking-tight">
                {s.title}
              </h2>
              <p className="font-serif italic text-muted text-sm leading-relaxed">
                {s.description}
              </p>
            </div>
          </div>
        ))}
      </section>

      {/* Production Journal Footer */}
      <footer className="border-t border-line pt-12 flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-muted-soft">
        <p className="font-serif italic">Craft is slow. Exclusivity is permanent.</p>
        <Link
          href="/shop"
          className="px-6 py-3 bg-accent text-white font-sans font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-accent-light transition"
        >
          Explore Drop N° 01
        </Link>
      </footer>

    </article>
  );
}
