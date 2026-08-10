import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getBuilderData } from '@/features/subscriptions/lib/builder-data';
import { getCurrentCustomer } from '@/lib/auth/customer';
import { createAdminClient } from '@/lib/supabase/admin';
import PlanBuilder from '@/features/subscriptions/builder/PlanBuilder';

export const metadata: Metadata = {
  title: 'Build your plan · GlassyVision',
  description: 'Pick a tier, configure your pairs, and check out — one year of eyewear, your way.',
};

export default async function MembershipBuildPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const { tier } = await searchParams;

  // Same active-membership check as /membership: existing members are
  // pointed at their account instead of being offered a second plan.
  let hasActiveMembership = false;
  try {
    const customer = await getCurrentCustomer();
    if (customer) {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('subscription_memberships')
        .select('id')
        .eq('customer_id', customer.id)
        .in('status', ['active', 'grace'])
        .maybeSingle();
      hasActiveMembership = !!data;
    }
  } catch {
    hasActiveMembership = false; // signed-out or auth hiccup → show normal page
  }

  if (hasActiveMembership) {
    redirect('/account/subscription');
  }

  const data = await getBuilderData();
  const initialTier = tier === 'solo' || tier === 'duo' || tier === 'trio' ? tier : null;

  return <PlanBuilder data={data} initialTier={initialTier} />;
}
