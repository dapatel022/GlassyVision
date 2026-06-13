'use client';

import { useEffect } from 'react';
import { useCart } from '@/context/CartContext';

/**
 * Empties the client cart once, on mount. Rendered on the post-checkout
 * confirmation page (/thanks): reaching it means the Shopify checkout completed,
 * so the local cart must be cleared — otherwise a returning customer still sees
 * the items and can re-checkout the same order (duplicate purchase).
 */
export default function ClearCartOnMount() {
  const { clear } = useCart();
  useEffect(() => {
    clear();
  }, [clear]);
  return null;
}
