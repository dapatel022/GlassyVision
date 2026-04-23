import { createAdminClient } from '@/lib/supabase/admin';
import { verifyRxToken, parseRxTokenParams } from '@/features/rx-intake/lib/rx-token';
import ReturnRequestForm from '@/features/returns/components/ReturnRequestForm';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function StartReturnPage({ params, searchParams }: PageProps) {
  const { orderId } = await params;
  const search = await searchParams;

  const urlParams = new URLSearchParams();
  if (typeof search.token === 'string') urlParams.set('token', search.token);
  if (typeof search.exp === 'string') urlParams.set('exp', search.exp);
  const tokenParams = parseRxTokenParams(urlParams);

  const isValid = tokenParams && verifyRxToken(orderId, tokenParams.token, tokenParams.exp);

  if (!isValid) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">Invalid link</h1>
          <p className="text-muted">Check the link in your email or contact hello@glassyvision.com.</p>
        </div>
      </div>
    );
  }

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from('orders')
    .select('id, shopify_order_number, customer_email, customer_name')
    .eq('shopify_order_number', orderId)
    .maybeSingle();

  if (!order) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">Order not found</h1>
          <p className="text-muted">We couldn&apos;t find an order with that number.</p>
        </div>
      </div>
    );
  }

  const { data: lineItems } = await supabase
    .from('order_line_items')
    .select('id, product_title, variant_title, sku, quantity, is_rx_required')
    .eq('order_id', order.id);

  const { data: existing } = await supabase
    .from('returns')
    .select('id, rma_number, status')
    .eq('order_id', order.id)
    .in('status', ['pending', 'in_progress']);

  return (
    <div className="min-h-screen bg-base py-12 px-4">
      <div className="max-w-xl mx-auto">
        <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">
          Order {order.shopify_order_number}
        </p>
        <h1 className="font-sans text-3xl font-black tracking-tight uppercase text-ink mb-2">
          Start a return
        </h1>
        <p className="text-muted font-serif italic mb-8">
          Tell us what happened — we&apos;ll get back to you within one business day.
        </p>

        {existing && existing.length > 0 ? (
          <div className="p-6 border border-warning/20 bg-warning/10 rounded-xl">
            <p className="font-sans font-bold text-warning mb-1">You already have an open return</p>
            <p className="text-sm text-warning">RMA {existing[0].rma_number} — status: {existing[0].status}.</p>
            <p className="text-sm text-muted mt-2">
              Reply to your confirmation email if you need to add information.
            </p>
          </div>
        ) : (
          <ReturnRequestForm
            orderDbId={order.id}
            lineItems={(lineItems ?? []).map((li) => ({
              id: li.id,
              productTitle: li.product_title,
              variantTitle: li.variant_title,
              isRxRequired: li.is_rx_required,
            }))}
          />
        )}
      </div>
    </div>
  );
}
