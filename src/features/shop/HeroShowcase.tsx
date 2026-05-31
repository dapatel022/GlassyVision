'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface ShowcaseItem {
  id: string;
  handle: string;
  title: string;
  price: string;
  colorName: string;
  colorHex: string; // for the swatch
  imageUrl: string;
  description: string;
  tag: string;
}

const SHOWCASE_ITEMS: ShowcaseItem[] = [
  {
    id: '1',
    handle: 'gv-01-archetype',
    title: 'GV-01 Archetype',
    price: '145',
    colorName: 'Honey Tortoise Acetate',
    colorHex: '#c9b77a',
    imageUrl: '/demo/archetype_tortoise.png',
    description: 'Classic round curves meet raw boldness. Hand-finished in warm honey tortoise with keyhole bridge details.',
    tag: 'Drop N° 01 · Best Seller'
  },
  {
    id: '2',
    handle: 'gv-02-linear',
    title: 'GV-02 Linear',
    price: '185',
    colorName: 'Matte Gunmetal Titanium',
    colorHex: '#718096',
    imageUrl: '/demo/linear_titanium.png',
    description: 'Sleek, minimalist pure titanium frames. Curated for lightweight comfort and structural strength.',
    tag: 'Drop N° 01 · Tech Focus'
  },
  {
    id: '3',
    handle: 'gv-03-voyager',
    title: 'GV-03 Voyager Sun',
    price: '160',
    colorName: 'Polished 18k Gold Plated',
    colorHex: '#d4af37',
    imageUrl: '/demo/voyager_aviator.png',
    description: 'Double-bridge aviator sunglasses with polarized dark forest green lenses. Shipped in premium leather case.',
    tag: 'Drop N° 01 · Limited Edition'
  },
  {
    id: '4',
    handle: 'gv-04-editor',
    title: 'GV-04 Editor',
    price: '150',
    colorName: 'Polished Piano Black',
    colorHex: '#1a202c',
    imageUrl: '/demo/editor_black.png',
    description: 'Thick, structural black square acetate frames with hand-pinned hinges for a bold statement.',
    tag: 'Drop N° 01 · Editorial Choice'
  }
];

export default function HeroShowcase() {
  const [activeIdx, setActiveIdx] = useState(0);
  const activeItem = SHOWCASE_ITEMS[activeIdx];
  const [fadeState, setFadeState] = useState<'in' | 'out'>('in');

  function handleSelect(idx: number) {
    if (idx === activeIdx) return;
    setFadeState('out');
    setTimeout(() => {
      setActiveIdx(idx);
      setFadeState('in');
    }, 200); // match transition speed
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
      {/* Left Column: Dynamic Typography */}
      <div className="lg:col-span-7 space-y-6">
        <div className={`transition-all duration-300 ${fadeState === 'in' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <p className="font-mono text-[10px] font-bold tracking-[4px] uppercase text-accent">
            {activeItem.tag}
          </p>
          <h1 className="font-sans text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter uppercase text-ink leading-[0.85] select-none mt-2">
            {activeItem.title.split(' ')[0]}<br />
            {activeItem.title.split(' ')[1] || 'FRAME'}<span className="text-accent">.</span>
          </h1>
          <p className="font-serif italic text-lg text-muted max-w-lg leading-relaxed mt-4">
            {activeItem.description}
          </p>
          <div className="mt-4 flex items-center gap-4 text-xs font-mono">
            <span className="text-muted-soft uppercase font-bold">Color:</span>
            <span className="text-ink font-bold">{activeItem.colorName}</span>
            <span className="text-line">|</span>
            <span className="text-accent font-bold">${activeItem.price} USD</span>
          </div>
        </div>

        {/* Color Swatch Selectors */}
        <div className="flex items-center gap-4 pt-4">
          <span className="text-xs font-mono text-muted-soft uppercase tracking-wider">Select Style:</span>
          <div className="flex items-center gap-3">
            {SHOWCASE_ITEMS.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => handleSelect(idx)}
                className={`w-7 h-7 rounded-full border-2 transition-all relative flex items-center justify-center ${
                  activeIdx === idx ? 'border-accent scale-110 shadow-sm' : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: item.colorHex }}
                title={item.title}
                aria-label={`Switch to ${item.title}`}
              >
                {activeIdx === idx && (
                  <span className="absolute w-2 h-2 rounded-full bg-white shadow-inner mix-blend-difference" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-6">
          <Link
            href={`/p/${activeItem.handle}`}
            className="px-6 py-3.5 bg-accent text-white font-sans font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-accent-light transition-colors shadow-sm"
          >
            Configure & Try On
          </Link>
          <Link
            href="/shop"
            className="px-6 py-3.5 border border-line text-ink font-sans font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-base-deeper transition-colors"
          >
            All Collections
          </Link>
        </div>
      </div>

      {/* Right Column: Visual Frame Card */}
      <div className="lg:col-span-5 relative group">
        <div className="relative aspect-[4/5] bg-white border border-line rounded-2xl overflow-hidden shadow-md">
          {/* inset-8 reproduces the old p-8 breathing room; absolute positioning
              avoids relying on h-full inside a flex+aspect parent (Safari/FF). */}
          <div className="absolute inset-8">
            <Image
              src={activeItem.imageUrl}
              alt={activeItem.title}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 40vw"
              className={`object-contain group-hover:scale-105 transition-all duration-500 ${
                fadeState === 'in' ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
              }`}
            />
          </div>
          {/* Floating Badge */}
          <div className="absolute top-6 right-6 bg-white/90 backdrop-blur border border-line rounded-full px-4 py-1.5 shadow-sm">
            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-accent">
              Drop N° 01 · Hand-Finished
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
