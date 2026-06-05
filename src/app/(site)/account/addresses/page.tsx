import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth/customer';
import { createAdminClient } from '@/lib/supabase/admin';
import AddressesManager, { type SavedAddress } from './addresses-manager';

export const metadata = { title: 'Saved addresses' };
export const dynamic = 'force-dynamic';

export default async function AddressesPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/account/login?next=/account/addresses');

  // The `.eq('customer_id', customer.id)` filter IS the authorization (the
  // service-role admin client bypasses RLS), mirroring the account dashboard.
  const supabase = createAdminClient();
  const { data: rows } = await supabase
    .from('customer_saved_addresses')
    .select('id, label, recipient_name, address, is_default, created_at')
    .eq('customer_id', customer.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  const addresses: SavedAddress[] = (rows ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    recipientName: r.recipient_name,
    isDefault: r.is_default,
    address: (r.address ?? {}) as SavedAddress['address'],
  }));

  return (
    <main className="min-h-screen bg-base px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8">
        <header>
          <h1 className="font-sans text-2xl font-black uppercase text-ink">Saved addresses</h1>
          <p className="text-sm text-muted mt-1">
            Save addresses to reuse them when redeeming a subscription pair.
          </p>
        </header>

        <AddressesManager addresses={addresses} />

        <Link href="/account" className="inline-block text-xs font-mono text-muted underline">
          ← Back to account
        </Link>
      </div>
    </main>
  );
}
