'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import type { CartLine, LensConfig } from '@/features/cart/types';

interface AddToCartButtonProps {
  line: Omit<CartLine, 'quantity' | 'lensConfig'>;
  lensConfig: LensConfig;
  totalPrice: number;
}

export default function AddToCartButton({ line, lensConfig, totalPrice }: AddToCartButtonProps) {
  const { addLine } = useCart();
  const router = useRouter();
  const [added, setAdded] = useState(false);

  function handleAdd() {
    addLine({ ...line, quantity: 1, lensConfig, unitPrice: totalPrice });
    setAdded(true);
    setTimeout(() => router.push('/cart'), 400);
  }

  return (
    <button
      onClick={handleAdd}
      disabled={added}
      className="w-full px-6 py-4 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light transition-colors disabled:opacity-70"
    >
      {added ? 'Added ✓ Taking you to cart…' : `Add to cart · $${totalPrice.toFixed(0)}`}
    </button>
  );
}
