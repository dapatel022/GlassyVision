'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { HeroSlide } from '@/lib/commerce/content';

export interface ExtendedHeroSlide extends HeroSlide {
  campaignUrl?: string;
}

const SHOWCASE_ITEMS: ExtendedHeroSlide[] = [
  {
    handle: 'gv-01-archetype',
    title: 'GV-01 Archetype',
    price: '145',
    colorName: 'Honey Tortoise Acetate',
    colorHex: '#c9b77a',
    imageUrl: '/demo/archetype_tortoise.png',
    campaignUrl: '/images/campaign_honey_tortoise.jpg',
    description: 'Classic round curves meet raw boldness. Hand-finished in warm honey tortoise with keyhole bridge details.',
    tag: 'Drop N° 01 · Best Seller'
  },
  {
    handle: 'gv-02-linear',
    title: 'GV-02 Linear',
    price: '185',
    colorName: 'Matte Gunmetal Titanium',
    colorHex: '#718096',
    imageUrl: '/demo/linear_titanium.png',
    campaignUrl: '/images/campaign_black_titanium.jpg',
    description: 'Sleek, minimalist pure titanium frames. Curated for lightweight comfort and structural strength.',
    tag: 'Drop N° 01 · Tech Focus'
  },
  {
    handle: 'gv-03-voyager',
    title: 'GV-03 Voyager Sun',
    price: '160',
    colorName: 'Polished 18k Gold Plated',
    colorHex: '#d4af37',
    imageUrl: '/demo/voyager_aviator.png',
    campaignUrl: '/images/campaign_gold_aviator.jpg',
    description: 'Double-bridge aviator sunglasses with polarized dark forest green lenses. Shipped in premium leather case.',
    tag: 'Drop N° 01 · Limited Edition'
  },
  {
    handle: 'gv-04-editor',
    title: 'GV-04 Editor',
    price: '150',
    colorName: 'Polished Piano Black',
    colorHex: '#1a202c',
    imageUrl: '/demo/editor_black.png',
    campaignUrl: '/images/campaign_black_titanium.jpg',
    description: 'Thick, structural black square acetate frames with hand-pinned hinges for a bold statement.',
    tag: 'Drop N° 01 · Editorial Choice'
  }
];

interface HeroShowcaseProps {
  slides?: HeroSlide[];
  badgeText?: string;
}

export default function HeroShowcase({ slides, badgeText }: HeroShowcaseProps) {
  const items = slides && slides.length > 0 ? (slides as ExtendedHeroSlide[]) : SHOWCASE_ITEMS;
  const [activeIdx, setActiveIdx] = useState(0);
  const activeItem = items[Math.min(activeIdx, items.length - 1)];
  const [fadeState, setFadeState] = useState<'in' | 'out'>('in');

  function handleSelect(idx: number) {
    if (idx === activeIdx) return;
    setFadeState('out');
    setTimeout(() => {
      setActiveIdx(idx);
      setFadeState('in');
    }, 200);
  }

  const activeCampaignUrl = activeItem.campaignUrl || '/images/campaign_black_titanium.jpg';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
      {/* Left Column: Dynamic High-Fashion Typography */}
      <div className="lg:col-span-6 space-y-6">
        <div className={`transition-all duration-300 ${fadeState === 'in' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="inline-flex items-center gap-3 px-3.5 py-1 bg-accent/10 border border-accent/20 rounded-full mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <p className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-accent">
              {activeItem.tag}
            </p>
          </div>

          <h1 className="font-sans text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter uppercase text-ink leading-[0.85] select-none mt-1">
            {activeItem.title.split(' ')[0]}<br />
            {activeItem.title.split(' ')[1] || 'FRAME'}<span className="text-accent">.</span>
          </h1>

          <p className="font-serif italic text-lg text-muted max-w-lg leading-relaxed mt-4">
            {activeItem.description}
          </p>

          <div className="mt-5 flex items-center gap-4 text-xs font-mono">
            <span className="text-muted-soft uppercase font-bold tracking-wider">Finish:</span>
            <span className="text-ink font-bold">{activeItem.colorName}</span>
            <span className="text-line">•</span>
            <span className="text-accent font-black text-sm">${activeItem.price} USD</span>
          </div>
        </div>

        {/* Color Swatch Selectors */}
        <div className="flex items-center gap-4 pt-2">
          <span className="text-xs font-mono text-muted-soft uppercase tracking-wider">Select Style:</span>
          <div className="flex items-center gap-3">
            {items.map((item, idx) => (
              <button
                key={item.handle}
                onClick={() => handleSelect(idx)}
                aria-pressed={activeIdx === idx}
                aria-label={`Select ${item.title}`}
                className={`w-8 h-8 rounded-full border-2 transition-all relative flex items-center justify-center ${
                  activeIdx === idx ? 'border-accent scale-110 shadow-md ring-2 ring-accent/20' : 'border-line hover:scale-105 opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: item.colorHex }}
                title={item.title}
              >
                {activeIdx === idx && (
                  <span className="absolute w-2.5 h-2.5 rounded-full bg-white shadow-inner mix-blend-difference" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-4">
          <Link
            href={`/p/${activeItem.handle}`}
            className="px-7 py-4 bg-ink text-white font-sans font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-accent transition-all duration-300 shadow-md hover:shadow-lg hover:-translate-y-0.5"
          >
            Configure & Try On
          </Link>
          <Link
            href="/shop"
            className="px-7 py-4 border border-line bg-white/80 backdrop-blur text-ink font-sans font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-base-deeper transition-all duration-300"
          >
            All Collections
          </Link>
        </div>
      </div>

      {/* Right Column: High Fashion Editorial Campaign Visual & Floating Product Lens Card */}
      <div className="lg:col-span-6 relative group">
        <div className="relative aspect-[4/5] bg-ink rounded-3xl overflow-hidden shadow-xl border border-line/80">
          {/* Background High-Fashion Campaign Photography */}
          <Image
            src={activeCampaignUrl}
            alt={`${activeItem.title} Editorial Campaign`}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className={`object-cover transition-all duration-700 ${
              fadeState === 'in' ? 'opacity-90 scale-100' : 'opacity-0 scale-105'
            }`}
          />

          {/* Dark luxury gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

          {/* Floating Product Frame Card (Glassmorphic inset) */}
          <div className="absolute bottom-6 left-6 right-6 bg-white/85 backdrop-blur-md border border-white/40 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div className="relative w-28 h-16 flex-none">
              <Image
                src={activeItem.imageUrl}
                alt={activeItem.title}
                fill
                sizes="112px"
                className="object-contain"
              />
            </div>
            <div className="flex-1 px-4 space-y-0.5">
              <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-accent">
                {activeItem.colorName}
              </p>
              <h3 className="font-sans font-black text-sm uppercase text-ink tracking-tight">
                {activeItem.title}
              </h3>
              <p className="font-mono text-xs font-bold text-ink/80">
                ${activeItem.price} USD
              </p>
            </div>
            <Link
              href={`/p/${activeItem.handle}`}
              className="flex-none px-3.5 py-2 bg-ink text-white rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider hover:bg-accent transition-colors"
            >
              View →
            </Link>
          </div>

          {/* Floating Top Badge */}
          <div className="absolute top-6 right-6 bg-black/60 backdrop-blur-md border border-white/20 rounded-full px-4 py-1.5 shadow-sm">
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-white">
              {badgeText ?? 'Drop N° 01 · Hand-Finished'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

