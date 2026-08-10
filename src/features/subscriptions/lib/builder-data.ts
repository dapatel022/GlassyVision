import { getProducts } from '@/lib/commerce/shopify';
import { getLensUpgradePricing, type LensPricingMap } from '@/lib/commerce/lens-pricing';
import { getFrameSurchargePricing, type FrameSurchargePrice } from '@/lib/commerce/frame-surcharge-pricing';
import { getMembershipPricing, type MembershipPricing } from '@/lib/commerce/membership-pricing';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Server-side data assembly for the membership plan-builder UI (Tasks 9-11).
 *
 * FRAME ELIGIBILITY MUST MATCH /checkout EXACTLY (src/app/checkout/route.ts):
 * a frame is only offered here if its `product_metadata.subscription_tier`
 * resolves to 'included' or 'premium' — the same `.in()` lookup and the same
 * two-value allowlist checkout enforces. Any drift here is a broken funnel:
 * the builder would let a customer configure a pair checkout then 409s.
 *
 * rxCapable mirrors `product_metadata.is_rx_capable`, the same flag
 * auto-redeem-pairs.ts gates Rx lens types on post-payment. It rides along so
 * Task 10's configurator can disable Rx lens choices on a non-Rx-capable
 * frame up front, instead of letting a customer configure a pair that would
 * fail closed after checkout.
 *
 * FAIL CLOSED per field, independently: a failed fetch degrades that field to
 * null/[] rather than throwing — the builder disables whatever it cannot
 * price rather than blocking on an unrelated fetch failure.
 */

export interface BuilderFrame {
  handle: string;
  title: string;
  image: string | null;
  variantId: number; // numeric id for PairConfig.v
  price: number; // regular price (display context only)
  premium: boolean;
  rxCapable: boolean;
}

export interface BuilderData {
  tiers: MembershipPricing; // existing type (null = fail closed)
  frames: BuilderFrame[]; // excludes membership/lens-upgrades/frame-surcharges
  lensPricing: LensPricingMap | null;
  surcharge: FrameSurchargePrice | null;
}

const EXCLUDED_HANDLES = new Set(['membership', 'lens-upgrades', 'frame-surcharges']);

interface ProductMetadataRow {
  shopify_variant_id: number;
  subscription_tier: string | null;
  is_rx_capable: boolean | null;
}

export async function getBuilderData(): Promise<BuilderData> {
  const [products, tiers, lensPricing, surcharge] = await Promise.all([
    getProducts(),
    getMembershipPricing(),
    getLensUpgradePricing(),
    getFrameSurchargePricing(),
  ]);

  // Resolve each non-excluded product's variant id up front — a product with
  // no variants, or whose first variant's gid doesn't parse to a finite
  // number, can never become a valid PairConfig.v and is dropped here.
  const candidates: Array<{ handle: string; title: string; image: string | null; variantId: number; price: number }> = [];
  for (const p of products) {
    if (EXCLUDED_HANDLES.has(p.handle)) continue;
    const firstVariant = p.variants[0];
    if (!firstVariant) continue;
    const variantId = Number(firstVariant.id.split('/').pop());
    if (!Number.isFinite(variantId)) continue;
    candidates.push({
      handle: p.handle,
      title: p.title,
      image: p.images[0]?.url ?? null,
      variantId,
      price: Number(firstVariant.price),
    });
  }

  if (candidates.length === 0) {
    return { tiers, frames: [], lensPricing, surcharge };
  }

  // Eligibility + premium/rx lookup: same shape and same fail-closed posture
  // as /checkout's product_metadata query. A failed lookup must never be
  // read as "no premium frames" or default to offering ineligible frames —
  // it drops every frame instead.
  const supabase = createAdminClient();
  const { data: metaRows, error: metaError } = await supabase
    .from('product_metadata')
    .select('shopify_variant_id, subscription_tier, is_rx_capable')
    .in('shopify_variant_id', candidates.map((c) => c.variantId));
  if (metaError) {
    console.error('[builder-data] product_metadata lookup failed — frames fail closed', metaError);
    return { tiers, frames: [], lensPricing, surcharge };
  }

  const metaByVariant = new Map(
    ((metaRows ?? []) as ProductMetadataRow[]).map((r) => [r.shopify_variant_id, r]),
  );

  const frames: BuilderFrame[] = [];
  for (const c of candidates) {
    const meta = metaByVariant.get(c.variantId);
    const tier = meta?.subscription_tier;
    if (tier !== 'included' && tier !== 'premium') continue;
    frames.push({
      handle: c.handle,
      title: c.title,
      image: c.image,
      variantId: c.variantId,
      price: c.price,
      premium: tier === 'premium',
      rxCapable: meta?.is_rx_capable === true,
    });
  }

  return { tiers, frames, lensPricing, surcharge };
}
