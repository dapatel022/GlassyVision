import { createAdminClient } from '@/lib/supabase/admin';
import { verifyRxToken, parseRxTokenParams } from '@/features/rx-intake/lib/rx-token';
import { cookies } from 'next/headers';
import RxIntakeWizard from '@/features/rx-intake/components/RxIntakeWizard';
import RxStatusDisplay from '@/features/rx-intake/components/RxStatusDisplay';
import RxOrderPending from '@/features/rx-intake/components/RxOrderPending';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RxIntakePage({ params, searchParams }: PageProps) {
  const { orderId } = await params;
  const search = await searchParams;

  const urlParams = new URLSearchParams();
  if (typeof search.token === 'string') urlParams.set('token', search.token);
  if (typeof search.exp === 'string') urlParams.set('exp', search.exp);

  const tokenParams = parseRxTokenParams(urlParams);
  const cookieStore = await cookies();
  const existingSession = cookieStore.get('rx_session')?.value;

  let isAuthenticated = false;

  if (tokenParams) {
    if (verifyRxToken(orderId, tokenParams.token, tokenParams.exp)) {
      isAuthenticated = true;
      cookieStore.set('rx_session', orderId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60,
        path: `/rx/${orderId}`,
      });
    }
  } else if (existingSession === orderId) {
    isAuthenticated = true;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">
            Invalid or Expired Link
          </h1>
          <p className="text-muted">
            This prescription upload link has expired or is invalid. Please check your email for a valid link,
            or contact support at hello@glassyvision.com.
          </p>
        </div>
      </div>
    );
  }

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, shopify_order_number, customer_email, customer_name, has_rx_items, rx_status, fulfillment_status')
    .eq('shopify_order_number', orderId)
    .maybeSingle();

  if (!order) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center px-4">
        <RxOrderPending orderId={orderId} />
      </div>
    );
  }

  if (order.fulfillment_status === 'delivered') {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">
            Order Already Delivered
          </h1>
          <p className="text-muted">This order has already been fulfilled.</p>
        </div>
      </div>
    );
  }

  if (!order.has_rx_items) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">
            No Prescription Required
          </h1>
          <p className="text-muted">This order doesn&apos;t contain any prescription items.</p>
        </div>
      </div>
    );
  }

  const { data: lineItems } = await supabase
    .from('order_line_items')
    .select('id, product_title, variant_title, sku')
    .eq('order_id', order.id)
    .eq('is_rx_required', true);

  const { data: rxFiles } = await supabase
    .from('rx_files')
    .select('id, line_item_id, uploaded_at, deleted_at')
    .eq('order_id', order.id)
    .is('deleted_at', null);

  const rxFileIds = (rxFiles || []).map((f) => f.id);
  let latestReview: { decision: string; decision_reason: string | null; notes: string | null } | null = null;

  if (rxFileIds.length > 0) {
    const { data: reviews } = await supabase
      .from('rx_reviews')
      .select('decision, decision_reason, notes')
      .in('rx_file_id', rxFileIds)
      .order('reviewed_at', { ascending: false })
      .limit(1);

    latestReview = reviews?.[0] || null;
  }

  const rxLineItems = (lineItems || []).map((li) => ({
    id: li.id,
    productTitle: li.product_title,
    variantTitle: li.variant_title,
    sku: li.sku,
  }));

  const uploadedLineItemIds = new Set((rxFiles || []).map((f) => f.line_item_id));
  const allUploaded = rxLineItems.every((li) => uploadedLineItemIds.has(li.id));

  if (latestReview?.decision === 'rejected') {
    return (
      <div className="min-h-screen bg-base py-12 px-4">
        <div className="max-w-xl mx-auto">
          <RxIntakeWizard
            orderId={orderId}
            orderDbId={order.id}
            lineItems={rxLineItems}
            customerEmail={order.customer_email}
            rejectionReason={latestReview.decision_reason ?? undefined}
          />
        </div>
      </div>
    );
  }

  if (allUploaded && order.rx_status === 'approved') {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center px-4">
        <RxStatusDisplay status="approved" />
      </div>
    );
  }

  if (allUploaded) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center px-4">
        <RxStatusDisplay status="uploaded_pending_review" />
      </div>
    );
  }

  const remainingItems = rxLineItems.filter((li) => !uploadedLineItemIds.has(li.id));

  return (
    <div className="min-h-screen bg-base py-12 px-4">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <p className="text-sm text-muted font-mono mb-1">Order {orderId}</p>
          <h1 className="font-sans text-3xl font-black tracking-tight uppercase text-ink">
            Upload Your Prescription
          </h1>
        </div>

        <RxIntakeWizard
          orderId={orderId}
          orderDbId={order.id}
          lineItems={remainingItems}
          customerEmail={order.customer_email}
        />
      </div>
    </div>
  );
}
