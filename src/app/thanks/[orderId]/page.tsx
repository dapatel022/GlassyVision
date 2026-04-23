import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateRxToken } from '@/features/rx-intake/lib/rx-token';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ orderId: string }>;
}

export default async function ThanksPage({ params }: PageProps) {
  const { orderId } = await params;
  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, shopify_order_number, customer_email, has_rx_items')
    .eq('shopify_order_number', orderId)
    .maybeSingle();

  if (!order) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-sans text-3xl font-black tracking-tight uppercase text-ink mb-3">
            Thank you!
          </h1>
          <p className="text-muted font-serif italic">
            We&apos;re processing your order now. Check your email in a minute for the order confirmation.
          </p>
        </div>
      </div>
    );
  }

  const rxUrl = order.has_rx_items
    ? (() => {
        const { token, exp } = generateRxToken(orderId);
        return `/rx/${orderId}?token=${token}&exp=${exp}`;
      })()
    : null;

  return (
    <div className="min-h-screen bg-base flex items-center justify-center px-4">
      <div className="max-w-lg text-center">
        <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">
          Order {order.shopify_order_number}
        </p>
        <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink mb-3">
          Thank you!
        </h1>

        {rxUrl ? (
          <>
            <p className="text-muted font-serif italic mb-6 leading-relaxed">
              One last step — we need your prescription to make your lenses.
              This takes about a minute and we&apos;ve also emailed you the link.
            </p>
            <Link
              href={rxUrl}
              className="inline-block px-8 py-4 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light transition-colors"
            >
              Upload your prescription
            </Link>
            <p className="text-xs text-muted-soft mt-6">
              We&apos;ve sent a confirmation to <strong>{order.customer_email}</strong>
            </p>
          </>
        ) : (
          <>
            <p className="text-muted font-serif italic mb-6 leading-relaxed">
              Your order is being prepared. We&apos;ll email tracking once it ships.
            </p>
            <Link
              href={`/track/${orderId}`}
              className="inline-block px-8 py-4 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light transition-colors"
            >
              Track your order
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
