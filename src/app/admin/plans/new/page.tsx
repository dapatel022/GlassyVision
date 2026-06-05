import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/middleware';
import PlanForm from '@/features/admin/plans/components/PlanForm';

export const dynamic = 'force-dynamic';

export default async function NewPlanPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin/plans/new');

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin/plans" className="text-xs font-mono text-accent hover:underline uppercase tracking-wider font-bold">
          ← Back to Plans
        </Link>
      </div>
      <div>
        <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">New plan</h1>
      </div>
      <PlanForm />
    </div>
  );
}
