import { NextRequest, NextResponse } from 'next/server';
import { createCart } from '@/lib/commerce/shopify';
import type { CartLine } from '@/features/cart/types';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { lines?: CartLine[] } | null;
  const lines = body?.lines ?? [];

  if (lines.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  }

  try {
    const cart = await createCart(
      lines.map((l) => ({
        merchandiseId: l.variantId,
        quantity: l.quantity,
        attributes: [
          { key: 'lens_type', value: l.lensConfig.lensType },
          { key: 'coatings', value: l.lensConfig.coatings.join(',') || 'none' },
          { key: 'tint', value: l.lensConfig.tint },
        ],
      })),
    );

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
