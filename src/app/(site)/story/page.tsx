export const metadata = {
  title: 'Our story',
  description: 'How GlassyVision was born.',
};

export default function StoryPage() {
  return (
    <article className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
      <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">Our story</p>
      <h1 className="font-sans text-5xl font-black tracking-tight uppercase text-ink mb-10 leading-[0.9]">
        Eyewear,<br />reconsidered<span className="text-accent">.</span>
      </h1>

      {/* COPY: pending brand team / founder */}
      <div className="prose font-serif text-muted space-y-6 leading-relaxed">
        <p>
          GlassyVision was founded with one idea: that buying glasses shouldn&apos;t feel like visiting a
          showroom — it should feel like finding something.
        </p>
        <p>
          We make small-batch frames, hand-finished in a single workshop in India by craftspeople
          who&apos;ve been cutting lenses their whole lives. Every drop is limited. Every pair is considered.
        </p>
        <p className="text-muted-soft italic">
          Full story pending brand voice finalization.
        </p>
      </div>
    </article>
  );
}
