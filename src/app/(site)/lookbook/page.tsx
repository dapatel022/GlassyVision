import Link from 'next/link';
import Image from 'next/image';

export const metadata = {
  title: 'Lookbook — Drop N° 01',
  description: 'The visual chronicle of Drop N° 01. Slow eyewear captured in Syracuse and Bombay.',
};

const LOOKS = [
  {
    id: 'look-1',
    number: '01',
    title: 'The Scholar Archetype',
    frameName: 'GV-01 Archetype',
    colorName: 'Honey Tortoise Acetate',
    description: 'A study in vintage geometry. Symmetrical soft curves meeting raw, chunky temple builds to establish modern intellectual weight.',
    imageUrl: '/demo/archetype_tortoise.png',
    campaignUrl: '/images/campaign_honey_tortoise.jpg',
    link: '/p/gv-01-archetype',
    bgStyle: 'bg-gradient-to-br from-amber-50/50 via-transparent to-neutral-200/20'
  },
  {
    id: 'look-2',
    number: '02',
    title: 'Titanium Linearism',
    frameName: 'GV-02 Linear',
    colorName: 'Matte Gunmetal Titanium',
    description: 'Shoring up the architecture. 100% pure titanium wire rims, engineered with a custom bridge offset to feel virtually weightless on the temples.',
    imageUrl: '/demo/linear_titanium.png',
    campaignUrl: '/images/campaign_black_titanium.jpg',
    link: '/p/gv-02-linear',
    bgStyle: 'bg-gradient-to-br from-slate-100 via-transparent to-zinc-200/30'
  },
  {
    id: 'look-3',
    number: '03',
    title: 'The Voyager Sunset',
    frameName: 'GV-03 Voyager Sun',
    colorName: '18k Gold Plated / polarized green',
    description: 'Chasing the light. Double-bridge tear-drop aviator frames in high-gloss polished gold, complete with deep forest green polarized lens coatings.',
    imageUrl: '/demo/voyager_aviator.png',
    campaignUrl: '/images/campaign_gold_aviator.jpg',
    link: '/p/gv-03-voyager',
    bgStyle: 'bg-gradient-to-br from-yellow-50/40 via-transparent to-stone-200/20'
  },
  {
    id: 'look-4',
    number: '04',
    title: 'The Studio Editor',
    frameName: 'GV-04 Editor',
    colorName: 'Piano Black Acetate',
    description: 'Thick acetate, hand-tumbled in wooden chips. Structured square edges accented with horizontal dual silver rivets to make an uncompromising editorial statement.',
    imageUrl: '/demo/editor_black.png',
    campaignUrl: '/images/campaign_black_titanium.jpg',
    link: '/p/gv-04-editor',
    bgStyle: 'bg-gradient-to-br from-gray-200/20 via-transparent to-neutral-300/30'
  }
];

export default function LookbookPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-16">
      
      {/* Editorial Header & Campaign Visual Banner */}
      <header className="space-y-8">
        <div className="max-w-xl">
          <p className="text-xs font-mono font-bold uppercase tracking-[4px] text-accent mb-2">Visual Chronicle</p>
          <h1 className="font-sans text-5xl sm:text-7xl font-black tracking-tighter uppercase text-ink leading-[0.85]">
            Drop N° 01<span className="text-accent">.</span>
          </h1>
          <p className="font-serif italic text-muted text-base mt-6 leading-relaxed">
            Small-batch optical structures captured in natural studio highlights. Designed to be worn, styled, and collected.
          </p>
        </div>

        <div className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden border border-line shadow-md">
          <Image
            src="/images/lookbook_campaign.jpg"
            alt="GlassyVision Drop N° 01 high fashion campaign imagery featuring models wearing titanium and acetate frames"
            fill
            priority
            sizes="(max-width: 1152px) 100vw, 1152px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent flex items-end p-6 md:p-8">
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-white">
              Drop N° 01 Campaign · Titanium & Pure Acetate
            </span>
          </div>
        </div>
      </header>

      {/* Designer Quote Block */}
      <section className="border-y border-line py-8 grid grid-cols-1 md:grid-cols-12 gap-8 items-center bg-white/40 px-6 rounded-2xl">
        <div className="md:col-span-4 font-mono text-[10px] font-bold uppercase tracking-wider text-accent">
          DESIGNER MANIFESTO
        </div>
        <div className="md:col-span-8 font-serif italic text-lg text-ink leading-relaxed">
          &ldquo;In limited-run frames, details are not decorative ornaments &mdash; they are the entire structure. We tumbled these acetates for three full days to ensure a deep mirror luster, then anchored them with 5-barrel hinges to build tools for life.&rdquo;
        </div>
      </section>

      {/* Asymmetric Magazine Grid */}
      <section className="space-y-24">
        {LOOKS.map((look, index) => {
          const isEven = index % 2 === 0;
          return (
            <div
              key={look.id}
              className={`flex flex-col lg:flex-row items-center gap-12 lg:gap-20 ${
                isEven ? '' : 'lg:flex-row-reverse'
              }`}
            >
              {/* Campaign Photo & Floating Frame Card */}
              <div className="w-full lg:w-3/5">
                <div className="relative aspect-[16/11] rounded-3xl overflow-hidden border border-line shadow-md group bg-ink">
                  <Image
                    src={look.campaignUrl}
                    alt={`${look.title} Campaign Editorial`}
                    fill
                    sizes="(max-width: 1024px) 100vw, 60vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-700 opacity-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />

                  {/* Floating Frame Inset */}
                  <div className="absolute bottom-5 left-5 bg-white/90 backdrop-blur-md border border-white/40 rounded-2xl p-3 flex items-center gap-3 shadow-lg max-w-[240px]">
                    <div className="relative w-20 h-12 flex-none">
                      <Image
                        src={look.imageUrl}
                        alt={look.frameName}
                        fill
                        sizes="80px"
                        className="object-contain"
                      />
                    </div>
                    <div className="text-left space-y-0.5">
                      <p className="font-sans font-black text-xs uppercase text-ink tracking-tight">
                        {look.frameName}
                      </p>
                      <p className="font-mono text-[9px] text-accent font-bold uppercase">
                        {look.colorName}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Look Info Block */}
              <div className="w-full lg:w-2/5 space-y-6">
                <div className="flex items-baseline gap-4">
                  <span className="font-mono text-4xl font-extrabold text-accent/20 select-none">
                    L-{look.number}
                  </span>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-accent">
                    {look.frameName}
                  </span>
                </div>
                
                <h2 className="font-sans text-3xl font-black uppercase text-ink tracking-tight leading-none">
                  {look.title}
                </h2>
                
                <p className="font-serif italic text-muted text-base leading-relaxed">
                  {look.description}
                </p>

                <div className="font-mono text-[10px] text-muted-soft border-t border-line/60 pt-4 flex gap-4">
                  <span>FINISH:</span>
                  <span className="text-ink font-bold uppercase">{look.colorName}</span>
                </div>

                <div className="pt-2">
                  <Link
                    href={look.link}
                    className="inline-flex items-center gap-2 text-xs font-sans font-bold uppercase tracking-wider text-accent hover:text-accent-light group transition-colors"
                  >
                    Configure Frame 
                    <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Lookbook Footer Join CTA */}
      <footer className="border-t border-line pt-12 text-center max-w-lg mx-auto space-y-4">
        <h3 className="font-sans text-xl font-black uppercase tracking-tight text-ink">Limited Allocations</h3>
        <p className="font-serif italic text-sm text-muted">
          Each batch is limited to 500 hand-finished pieces. Subscribe to receive launch invitations before public releases.
        </p>
        <Link
          href="/shop"
          className="inline-block px-6 py-3 bg-accent text-white font-sans font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-accent-light transition"
        >
          View Store Catalog
        </Link>
      </footer>
      
    </div>
  );
}
