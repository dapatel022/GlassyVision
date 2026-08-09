'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CartLine } from '@/features/cart/types';
import {
  cartFrameSummary,
  matchTierForCart,
  type MembershipMath,
} from '@/lib/commerce/membership-math-core';

const TIER_LABELS: Record<string, string> = { solo: 'Solo', duo: 'Duo', trio: 'Trio' };

/**
 * "Your cart is $437 — Trio covers 3 pairs for $189/yr." Renders only when
 * the live math actually beats the cart. Fetch failure / null math → nothing
 * (fail closed — never estimate a saving).
 */
export default function CartMembershipNudge({ lines }: { lines: CartLine[] }) {
  const [math, setMath] = useState<MembershipMath | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/membership-math')
      .then((r) => r.json())
      .then((body: { math: MembershipMath | null }) => { if (!cancelled) setMath(body.math); })
      .catch(() => { if (!cancelled) setMath(null); });
    return () => { cancelled = true; };
  }, []);

  const { frameCount, frameSubtotal } = cartFrameSummary(lines);
  const tier = matchTierForCart(math, frameCount, frameSubtotal);
  if (!tier) return null;

  return (
    <div className="p-4 border border-accent/40 bg-accent/5 rounded-xl">
      <p className="text-sm text-ink">
        <strong className="font-bold">Your {frameCount === 1 ? 'frame is' : `${frameCount} frames are`} ${frameSubtotal.toFixed(0)}.</strong>{' '}
        The {TIER_LABELS[tier.tier]} membership covers {tier.pairs}{' '}
        {tier.pairs === 1 ? 'pair' : 'pairs'} for ${tier.yearly.toFixed(0)}/yr.
      </p>
      <Link href="/membership" className="text-sm text-accent underline underline-offset-2">
        See if membership beats this cart →
      </Link>
    </div>
  );
}
