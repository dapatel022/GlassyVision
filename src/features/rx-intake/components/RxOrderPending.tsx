'use client';

import { useEffect, useState } from 'react';

interface RxOrderPendingProps {
  orderId: string;
}

export default function RxOrderPending({ orderId }: RxOrderPendingProps) {
  const [attempts, setAttempts] = useState(0);
  const maxAttempts = 10;

  useEffect(() => {
    if (attempts >= maxAttempts) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/rx/order-status?orderId=${encodeURIComponent(orderId)}`);
        if (res.ok) {
          const body = await res.json() as { exists?: boolean };
          if (body.exists) {
            window.location.reload();
            return;
          }
        }
      } catch {
        // network error — try again
      }
      setAttempts((a) => a + 1);
    }, 3000);

    return () => clearTimeout(timer);
  }, [attempts, orderId]);

  if (attempts >= maxAttempts) {
    return (
      <div className="text-center py-12">
        <h2 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">
          We&apos;re Still Processing Your Order
        </h2>
        <p className="text-muted max-w-md mx-auto">
          This is taking longer than expected. We&apos;ve sent a prescription upload link to your email — please check your inbox.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <div className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full animate-spin mx-auto mb-4" />
      <h2 className="font-sans text-xl font-bold text-ink mb-2">Processing Your Order...</h2>
      <p className="text-muted text-sm">This usually takes a few seconds.</p>
    </div>
  );
}
