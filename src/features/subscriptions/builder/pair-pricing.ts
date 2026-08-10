import { chargeableOptionIds, type PairConfig } from '@/features/subscriptions/lib/pair-config';
import type { LensPricingMap } from '@/lib/commerce/lens-pricing';
import type { FrameSurchargePrice } from '@/lib/commerce/frame-surcharge-pricing';

/**
 * Pure addon-total helper shared by the pair configurator (Task 10) and the
 * plan review/checkout handoff (Task 11). Mirrors /checkout's own pricing
 * posture: every chargeable id must resolve to a LIVE price, and a premium
 * frame must resolve a live surcharge — otherwise this returns null so the
 * caller fails closed (disable the control / block "done") instead of
 * rendering or charging a price we never actually have on file.
 */
export function pairAddonTotal(
  config: PairConfig,
  premium: boolean,
  lensPricing: LensPricingMap | null,
  surcharge: FrameSurchargePrice | null,
): number | null {
  let total = 0;

  for (const optionId of chargeableOptionIds(config)) {
    const price = lensPricing?.[optionId]?.price;
    if (price === undefined) return null;
    total += price;
  }

  if (premium) {
    if (surcharge === null) return null;
    total += surcharge.price;
  }

  return total;
}
