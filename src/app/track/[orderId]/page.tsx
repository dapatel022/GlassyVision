import { createAdminClient } from '@/lib/supabase/admin';
import { verifyRxToken, parseRxTokenParams } from '@/features/rx-intake/lib/rx-token';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const STAGES = [
  { key: 'ordered', label: 'Ordered' },
  { key: 'rx_received', label: 'Rx received' },
  { key: 'in_production', label: 'In production' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

export default async function TrackOrderPage({ params, searchParams }: PageProps) {
  const { orderId } = await params;
  const search = await searchParams;

  // Require a valid token so order-number enumeration can't reveal any order's
  // fulfillment/Rx status. The token is only delivered to the order owner (in the
  // shipping email or via an authenticated account page).
  const urlParams = new URLSearchParams();
  if (typeof search.token === 'string') urlParams.set('token', search.token);
  if (typeof search.exp === 'string') urlParams.set('exp', search.exp);
  const tokenParams = parseRxTokenParams(urlParams);
  const isAuthenticated = tokenParams ? verifyRxToken(orderId, tokenParams.token, tokenParams.exp) : false;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">
            Sign in to track your order
          </h1>
          <p className="text-muted">
            Use the tracking link from your shipping email, or{' '}
            <a href="/account/login" className="text-accent underline">sign in to your account</a>{' '}
            to see your order status.
          </p>
        </div>
      </div>
    );
  }

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, shopify_order_number, rx_status, fulfillment_status, has_rx_items')
    .eq('shopify_order_number', orderId)
    .maybeSingle();

  if (!order) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">
            Order not found
          </h1>
          <p className="text-muted">Double-check the link in your email, or contact hello@glassyvision.com.</p>
        </div>
      </div>
    );
  }

  let currentStage = 0;
  if (order.has_rx_items && order.rx_status && ['uploaded_pending_review', 'approved'].includes(order.rx_status)) currentStage = 1;
  if (order.fulfillment_status === 'in_lab') currentStage = 2;
  if (order.fulfillment_status === 'shipped') currentStage = 3;
  if (order.fulfillment_status === 'delivered') currentStage = 4;

  return (
    <div className="min-h-screen bg-base px-4 py-16">
      <div className="max-w-2xl mx-auto">
        <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">
          Order {order.shopify_order_number}
        </p>
        <h1 className="font-sans text-3xl font-black tracking-tight uppercase text-ink mb-8">
          Track your order
        </h1>

        <ol className="space-y-4">
          {STAGES.map((stage, i) => {
            const done = i <= currentStage;
            const active = i === currentStage;
            return (
              <li key={stage.key} className="flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-mono text-sm ${
                    done ? 'bg-accent text-white' : 'bg-base-deeper text-muted-soft'
                  } ${active ? 'ring-2 ring-accent ring-offset-2 ring-offset-base' : ''}`}
                >
                  {done ? '✓' : i + 1}
                </div>
                <div className="flex-1">
                  <p className={`font-sans font-bold text-sm uppercase tracking-wider ${done ? 'text-ink' : 'text-muted-soft'}`}>
                    {stage.label}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-10 p-4 bg-base-deeper border border-line rounded-xl">
          <p className="text-sm text-muted font-serif italic">
            We&apos;ll email you at each milestone. Questions? hello@glassyvision.com
          </p>
        </div>
      </div>
    </div>
  );
}
