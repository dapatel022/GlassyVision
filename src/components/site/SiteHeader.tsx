'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '@/context/CartContext';

const NAV_LINKS = [
  { href: '/shop', label: 'Shop' },
  { href: '/drops', label: 'Drops' },
  { href: '/story', label: 'Story' },
  { href: '/lookbook', label: 'Lookbook' },
];

export default function SiteHeader() {
  const { count, hydrated } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-base/90 backdrop-blur border-b border-line">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="font-sans text-lg font-black tracking-tight uppercase text-ink">
          GLASSYVISION<span className="text-accent">.</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="font-sans text-sm font-bold uppercase tracking-wider text-ink hover:text-accent transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/account"
            className="hidden md:inline-block text-xs font-sans font-bold uppercase tracking-wider text-muted hover:text-ink"
          >
            Account
          </Link>
          <Link
            href="/cart"
            className="relative inline-flex items-center gap-1 font-sans text-sm font-bold uppercase tracking-wider text-ink hover:text-accent transition-colors"
          >
            Cart
            {hydrated && count > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-white text-xs font-mono">
                {count}
              </span>
            )}
          </Link>

          <button
            type="button"
            className="md:hidden p-2 text-ink"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              {mobileOpen ? (
                <path strokeLinecap="round" d="M4 4l12 12M4 16L16 4" />
              ) : (
                <path strokeLinecap="round" d="M3 6h14M3 10h14M3 14h14" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-line bg-base">
          <nav className="flex flex-col p-4 gap-3">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="font-sans text-sm font-bold uppercase tracking-wider text-ink py-2"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/account"
              onClick={() => setMobileOpen(false)}
              className="font-sans text-sm font-bold uppercase tracking-wider text-muted py-2 border-t border-line"
            >
              Account
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
