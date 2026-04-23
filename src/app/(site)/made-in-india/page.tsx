export const metadata = {
  title: 'Made in India',
  description: 'Hand-finished in a single workshop in India.',
};

export default function MadeInIndiaPage() {
  return (
    <article className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
      <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">
        Where we make them
      </p>
      <h1 className="font-sans text-5xl font-black tracking-tight uppercase text-ink mb-10 leading-[0.9]">
        Made in<br />India<span className="text-accent">.</span>
      </h1>

      {/* COPY: pending brand team — highlight workshop, craftspeople, materials */}
      <div className="prose font-serif text-muted space-y-6 leading-relaxed">
        <p>
          Every GlassyVision frame is made in a single workshop in India by a small team who have
          been cutting and fitting lenses for decades.
        </p>
        <p>
          Frames are acetate, turned and polished by hand. Lenses are cut in-house. QC is done at
          the bench, not on a server.
        </p>
        <p className="text-muted-soft italic">
          Detailed process photography + workshop story coming with Drop Nº 01.
        </p>
      </div>
    </article>
  );
}
