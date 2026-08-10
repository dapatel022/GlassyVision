import type { BuilderState } from './builder-state';
import type { BuilderData } from '@/features/subscriptions/lib/builder-data';
import { pairAddonTotal } from './pair-pricing';

/**
 * Pure totals for the review step (Task 11). Reads live prices only —
 * tier price from `data.tiers`, per-pair addons from `pairAddonTotal`
 * (Task 10) — never a hardcoded figure.
 *
 * Fails closed to null in two cases: `data.tiers` unavailable (mirrors
 * every other builder surface's posture on a pricing outage), or no tier
 * selected yet (there is no tier price to total against). Both mean the
 * caller has nothing to show — render the same "pricing unavailable" /
 * "pick a plan first" state it already renders elsewhere.
 *
 * `blocked` is true when ANY configured pair's pairAddonTotal comes back
 * null (something chargeable in that pair is unpriceable). Unpriceable
 * pairs simply don't contribute to `addons`/`total` — the flag, not the
 * number, is what the checkout button gates on.
 */

export interface BuilderTotals {
  tierPrice: number;
  addons: number;
  total: number;
  perPairAllIn: number;
  blocked: boolean;
}

export function builderTotals(state: BuilderState, data: BuilderData): BuilderTotals | null {
  if (data.tiers === null) return null;
  if (!state.tier) return null;
  const tier = data.tiers.find((t) => t.tier === state.tier);
  if (!tier) return null;

  let addons = 0;
  let blocked = false;

  for (const pair of state.pairs) {
    if (!pair) continue;
    const frame = data.frames.find((f) => f.handle === pair.h);
    const addon = pairAddonTotal(pair, frame?.premium ?? false, data.lensPricing, data.surcharge);
    if (addon === null) {
      blocked = true;
      continue;
    }
    addons += addon;
  }

  const total = tier.price + addons;
  const perPairAllIn = tier.pairs > 0 ? total / tier.pairs : total;

  return { tierPrice: tier.price, addons, total, perPairAllIn, blocked };
}
