import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdminRole } from '@/lib/auth/middleware';
import { createAdminClient } from '@/lib/supabase/admin';
import PlanForm from '@/features/admin/plans/components/PlanForm';

export const dynamic = 'force-dynamic';

const LIVE_STATUSES = ['active', 'grace', 'disputed', 'frozen'] as const;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPlanPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdminRole(user.role)) redirect('/unauthorized');

  const { id } = await params;
  if (id === 'new') redirect('/admin/plans/new');

  const supabase = createAdminClient();
  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!plan) notFound();

  const { count } = await supabase
    .from('subscription_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', id)
    .in('status', [...LIVE_STATUSES]);

  const termsLocked = (count ?? 0) > 0;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin/plans" className="text-xs font-mono text-accent hover:underline uppercase tracking-wider font-bold">
          ← Back to Plans
        </Link>
      </div>
      <div>
        <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">
          Edit {plan.name}
        </h1>
        {termsLocked && (
          <p className="font-mono text-xs text-muted">{count} live membership(s) — terms frozen.</p>
        )}
      </div>
      <PlanForm
        existing={{
          id: plan.id,
          name: plan.name,
          pairs_count: plan.pairs_count,
          term_months: plan.term_months,
          redemption_policy: plan.redemption_policy as { mode?: string } | null,
          end_of_term_policy: plan.end_of_term_policy as {
            mode?: string;
            reminder_days?: number[];
            grace_days?: number;
          } | null,
          status: plan.status,
          shopify_product_id: plan.shopify_product_id,
          shopify_variant_id: plan.shopify_variant_id,
        }}
        termsLocked={termsLocked}
      />
    </div>
  );
}
