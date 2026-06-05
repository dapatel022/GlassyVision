import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth/customer';
import { createAdminClient } from '@/lib/supabase/admin';

export const metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/account/login?next=/account');

  // Lightweight membership check — the `.eq('customer_id', customer.id)` filter
  // IS the authorization (the service-role admin client bypasses RLS).
  const supabase = createAdminClient();
  const { data: membership } = await supabase
    .from('subscription_memberships')
    .select('id')
    .eq('customer_id', customer.id)
    .in('status', ['active', 'grace'])
    .maybeSingle();

  return (
    <main className="min-h-screen bg-base px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8">
        <header>
          <h1 className="font-sans text-2xl font-black uppercase text-ink">Your account</h1>
          <p className="text-sm text-muted mt-1">{customer.email}</p>
        </header>
        {membership ? (
          <Link
            href="/account/subscription"
            className="block border border-line bg-white p-6 hover:border-accent transition-colors"
          >
            <h2 className="font-sans text-sm font-bold uppercase tracking-widest text-ink">Subscription</h2>
            <p className="text-sm text-muted mt-2">View your subscription, redeem pairs, and track shipments →</p>
          </Link>
        ) : (
          <Link
            href="/shop"
            className="block border border-line bg-white p-6 hover:border-accent transition-colors"
          >
            <h2 className="font-sans text-sm font-bold uppercase tracking-widest text-ink">Subscriptions</h2>
            <p className="text-sm text-muted mt-2">Browse subscriptions and start your membership →</p>
          </Link>
        )}
        <Link
          href="/account/orders"
          className="block border border-line bg-white p-6 hover:border-accent transition-colors"
        >
          <h2 className="font-sans text-sm font-bold uppercase tracking-widest text-ink">Orders</h2>
          <p className="text-sm text-muted mt-2">View your order history and track shipments →</p>
        </Link>
        <Link
          href="/account/addresses"
          className="block border border-line bg-white p-6 hover:border-accent transition-colors"
        >
          <h2 className="font-sans text-sm font-bold uppercase tracking-widest text-ink">Saved addresses</h2>
          <p className="text-sm text-muted mt-2">Manage addresses to reuse when redeeming a pair →</p>
        </Link>
        <form action="/account/auth/signout" method="post">
          <button type="submit" className="text-xs font-mono text-muted underline">Sign out</button>
        </form>
      </div>
    </main>
  );
}
