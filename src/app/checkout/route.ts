import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createCart } from '@/lib/commerce/shopify';
import { lensRequiresRx, selectedOptionIds } from '@/features/shop/lens-options';
import { getLensUpgradePricing } from '@/lib/commerce/lens-pricing';
import { createRateLimiter, clientIpFrom } from '@/lib/security/rate-limit';
import type { CartLine } from '@/features/cart/types';

// Each call creates a real Shopify cart — bound scripted abuse.
const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function POST(request: NextRequest) {
  if (!limiter(clientIpFrom(request.headers))) {
    return NextResponse.json({ error: 'Too many requests — please try again shortly' }, { status: 429 });
  }
  const body = await request.json().catch(() => null) as { lines?: CartLine[] } | null;
  const lines = body?.lines ?? [];

  if (lines.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  }

  // Lens upgrades are charged as separate line items paired to their frame
  // line. Selection is re-derived server-side from lensConfig and priced from
  // Shopify — the client is never trusted with prices or variant ids.
  const needsPricing = lines.some((l) => selectedOptionIds(l.lensConfig).length > 0);
  const pricing = needsPricing ? await getLensUpgradePricing() : null;

  const cartLines: Array<{ merchandiseId: string; quantity: number; attributes: Array<{ key: string; value: string }> }> = [];

  for (const l of lines) {
    const lineRef = randomUUID();
    cartLines.push({
      merchandiseId: l.variantId,
      quantity: l.quantity,
      attributes: [
        // is_rx_required is the authoritative signal the order-sync webhook
        // reads to flag the order for the Rx pipeline. lens_type/coatings/tint
        // ride along for the lab job sheet; line_ref pairs add-on lines below.
        { key: 'is_rx_required', value: String(lensRequiresRx(l.lensConfig)) },
        { key: 'lens_type', value: l.lensConfig.lensType },
        { key: 'coatings', value: l.lensConfig.coatings.join(',') || 'none' },
        { key: 'tint', value: l.lensConfig.tint },
        { key: 'line_ref', value: lineRef },
      ],
    });

    for (const optionId of selectedOptionIds(l.lensConfig)) {
      const upgrade = pricing?.[optionId];
      if (!upgrade) {
        // FAIL CLOSED: a paid upgrade we cannot resolve to a Shopify variant
        // must never be silently dropped (that is the free-upgrade leak).
        console.error('[checkout] unresolvable lens upgrade — blocking checkout', { optionId, pricingAvailable: pricing !== null });
        return NextResponse.json(
          { error: 'Lens upgrade pricing is unavailable — please try again shortly' },
          { status: 409 },
        );
      }
      cartLines.push({
        merchandiseId: upgrade.variantId,
        quantity: l.quantity,
        attributes: [
          { key: '_addon_for', value: lineRef },
          { key: 'is_rx_required', value: 'false' },
        ],
      });
    }
  }

  try {
    const cart = await createCart(cartLines);

    const response = NextResponse.json({ checkoutUrl: cart.checkoutUrl, cartId: cart.id });
    response.cookies.set('gv_cart_id', cart.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    return response;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not create checkout' },
      { status: 500 },
    );
  }
}
