import Link from 'next/link';
import { getMembershipMath } from '@/lib/commerce/membership-math';
import { getCurrentCustomer } from '@/lib/auth/customer';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Post-purchase seed: "your next pair could be $X". No order lookup — /thanks
 * must stay order-blind (audit C3). Suppressed for active members; fail
 * closed when math is unavailable.
 */
export default async function ThanksMembershipPitch() {
  const math = await getMembershipMath();
  if (!math) return null;

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
      if (data) return null; // already a member — no pitch
    }
  } catch {
    // signed-out / auth hiccup → show the pitch (it's generic and harmless)
  }

  return (
    <div className="mt-8 p-5 border border-line rounded-2xl bg-white text-left">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-accent">
        Before you go
      </p>
      <p className="font-sans font-black text-lg text-ink mt-1">
        Your next pair could be ${math.bestPerPair}.
      </p>
      <p className="font-serif italic text-sm text-muted mt-1 leading-relaxed">
        Members get up to three pairs a year — any frame, Rx or plano — for one prepaid price.
      </p>
      <Link href="/membership" className="inline-block mt-3 font-mono text-xs font-bold uppercase tracking-widest text-accent underline underline-offset-2">
        See the math →
      </Link>
    </div>
  );
}
