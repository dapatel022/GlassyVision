import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth/customer';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCustomerOrders } from '@/features/account/orders/get-customer-orders';

export const metadata = { title: 'Orders' };
export const dynamic = 'force-dynamic';

const FINANCIAL_LABEL: Record<string, string> = {
  paid: 'Paid',
  refunded: 'Refunded',
  partial_refund: 'Partially refunded',
  pending: 'Pending',
};

const FULFILLMENT_LABEL: Record<string, string> = {
  unfulfilled: 'Preparing',
  in_lab: 'In production',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}

export default async function OrdersPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/account/login?next=/account/orders');

  // The admin client bypasses RLS; `getCustomerOrders` scopes by customer.id
  // (and excludes subscription orders) — that filter IS the authorization.
  const supabase = createAdminClient();
  const orders = await getCustomerOrders(customer.id, supabase);

  return (
    <main className="min-h-screen bg-base px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8">
        <header>
          <h1 className="font-sans text-2xl font-black uppercase text-ink">Your orders</h1>
          <p className="text-sm text-muted mt-1">{customer.email}</p>
        </header>

        {orders.length === 0 ? (
          <div className="border border-dashed border-line rounded-xl p-12 text-center">
            <p className="font-serif italic text-muted">You haven&apos;t placed any orders yet.</p>
            <Link href="/shop" className="inline-block mt-4 text-accent underline">
              Browse frames →
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {orders.map((order) => (
              <li key={order.id} className="border border-line bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-sans font-bold text-sm text-ink">Order {order.orderNumber}</p>
                    <p className="text-xs font-mono text-muted mt-1">{formatDate(order.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-sans text-sm text-ink">{formatMoney(order.total, order.currency)}</p>
                    <p className="text-xs font-mono text-muted mt-1">
                      {FULFILLMENT_LABEL[order.fulfillmentStatus] ?? order.fulfillmentStatus}
                      {order.financialStatus !== 'paid' && (
                        <span className="text-accent ml-2">
                          {FINANCIAL_LABEL[order.financialStatus] ?? order.financialStatus}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {order.lineItems.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-muted">
                    {order.lineItems.map((li) => (
                      <li key={li.id}>
                        {li.quantity > 1 && <span className="font-mono text-xs mr-1">{li.quantity}×</span>}
                        {li.title}
                        {li.variantTitle && <span className="text-muted-soft"> · {li.variantTitle}</span>}
                      </li>
                    ))}
                  </ul>
                )}

                <Link
                  href={`/track/${order.orderNumber}`}
                  className="inline-block mt-4 text-xs font-mono text-accent underline"
                >
                  Track this order →
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Link href="/account" className="inline-block text-xs font-mono text-muted underline">
          ← Back to account
        </Link>
      </div>
    </main>
  );
}
