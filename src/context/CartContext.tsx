'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { CartLine } from '@/features/cart/types';
import { lensRequiresRx } from '@/features/shop/lens-options';

const STORAGE_KEY = 'gv_cart_v1';

interface CartContextValue {
  lines: CartLine[];
  addLine: (line: CartLine) => void;
  updateQty: (variantId: string, quantity: number) => void;
  removeLine: (variantId: string) => void;
  clear: () => void;
  subtotal: number;
  hasRxItems: boolean;
  count: number;
  hydrated: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let next: CartLine[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartLine[];
        if (Array.isArray(parsed)) next = parsed;
      }
    } catch {
      // corrupt cart — start fresh
    }
    // One-time hydration from external source (localStorage) on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(next);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // storage full / disabled — ignore
    }
  }, [lines, hydrated]);

  const addLine = useCallback((line: CartLine) => {
    setLines((prev) => {
      const existingIdx = prev.findIndex(
        (l) => l.variantId === line.variantId &&
          JSON.stringify(l.lensConfig) === JSON.stringify(line.lensConfig),
      );
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], quantity: next[existingIdx].quantity + line.quantity };
        return next;
      }
      return [...prev, line];
    });
  }, []);

  const updateQty = useCallback((variantId: string, quantity: number) => {
    setLines((prev) =>
      prev.flatMap((l) => {
        if (l.variantId !== variantId) return [l];
        if (quantity <= 0) return [];
        return [{ ...l, quantity }];
      }),
    );
  }, []);

  const removeLine = useCallback((variantId: string) => {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
    [lines],
  );

  const hasRxItems = useMemo(
    () => lines.some((l) => lensRequiresRx(l.lensConfig)),
    [lines],
  );

  const count = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity, 0),
    [lines],
  );

  const value = useMemo<CartContextValue>(
    () => ({ lines, addLine, updateQty, removeLine, clear, subtotal, hasRxItems, count, hydrated }),
    [lines, addLine, updateQty, removeLine, clear, subtotal, hasRxItems, count, hydrated],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
