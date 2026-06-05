import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth/customer';
import { createAdminClient } from '@/lib/supabase/admin';
import RedeemForm, { type FrameOption, type AddonOption } from './redeem-form';
import type { RedeemSavedAddress } from './ship-to';

export const metadata = { title: 'Redeem a pair' };
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slotId: string }>;
}

export default async function RedeemPage({ params }: PageProps) {
  const { slotId } = await params;

  const customer = await getCurrentCustomer();
  if (!customer) redirect(`/account/login?next=/account/subscription/redeem/${slotId}`);

  const supabase = createAdminClient();

  // Verify the slot belongs to the caller and is available before rendering the
  // form. startRedemption re-checks ownership + availability authoritatively;
  // this is just a friendly gate so we don't show a form for someone else's slot.
  const { data: slot } = await supabase
    .from('subscription_redemptions')
    .select('id, status, slot_index, subscription_memberships ( customer_id, status )')
    .eq('id', slotId)
    .maybeSingle();

  const membership = (slot as unknown as {
    subscription_memberships: { customer_id: string | null; status: string } | null;
  } | null)?.subscription_memberships ?? null;

  const ownedAndAvailable =
    slot && membership && membership.customer_id === customer.id && slot.status === 'available';

  if (!ownedAndAvailable) {
    return (
      <main className="min-h-screen bg-base px-6 py-16">
        <div className="max-w-2xl mx-auto space-y-4 text-center">
          <h1 className="font-sans text-2xl font-black uppercase text-ink">Pair unavailable</h1>
          <p className="text-sm text-muted">This pair can&apos;t be redeemed right now.</p>
          <Link href="/account/subscription" className="inline-block text-accent underline">
            ← Back to subscription
          </Link>
        </div>
      </main>
    );
  }

  // Eligible frames: subscription_tier in ('included','premium').
  const { data: frameRows } = await supabase
    .from('product_metadata')
    .select('shopify_variant_id, sku, frame_shape, subscription_tier')
    .in('subscription_tier', ['included', 'premium'])
    .order('sku', { ascending: true });

  const frames: FrameOption[] = (frameRows ?? []).map((f) => ({
    variantId: f.shopify_variant_id,
    sku: f.sku,
    shape: f.frame_shape,
    isPremium: f.subscription_tier === 'premium',
  }));

  // Active add-on lens options.
  const { data: addonRows } = await supabase
    .from('subscription_addon_options')
    .select('key, label, price')
    .eq('active', true)
    .order('label', { ascending: true });

  const addons: AddonOption[] = (addonRows ?? []).map((a) => ({
    key: a.key,
    label: a.label,
    price: Number(a.price),
  }));

  // The customer's saved addresses, offered as a picker that prefills ship_to.
  // The `.eq('customer_id', customer.id)` filter IS the authorization (the
  // service-role admin client bypasses RLS), mirroring the account pages.
  const { data: addrRows } = await supabase
    .from('customer_saved_addresses')
    .select('id, label, recipient_name, address, is_default, created_at')
    .eq('customer_id', customer.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  const savedAddresses: RedeemSavedAddress[] = (addrRows ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    recipientName: r.recipient_name,
    address: (r.address ?? {}) as RedeemSavedAddress['address'],
  }));

  return (
    <main className="min-h-screen bg-base px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8">
        <header>
          <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">
            Pair {slot.slot_index + 1}
          </p>
          <h1 className="font-sans text-2xl font-black uppercase text-ink">Redeem a pair</h1>
          <p className="text-sm text-muted mt-1">
            Choose a frame and lens options. Premium frames and lens upgrades are billed separately at checkout.
          </p>
        </header>

        <RedeemForm slotId={slotId} frames={frames} addons={addons} savedAddresses={savedAddresses} />

        <Link href="/account/subscription" className="inline-block text-xs font-mono text-muted underline">
          ← Back to subscription
        </Link>
      </div>
    </main>
  );
}
