import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/middleware';
import DropForm from '@/features/admin/drops/components/DropForm';

export const dynamic = 'force-dynamic';

export default async function NewDropPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin/drops/new');

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin/drops" className="text-xs font-mono text-accent hover:underline uppercase tracking-wider font-bold">
          ← Back to Drops List
        </Link>
      </div>
      <div>
        <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">New drop</h1>
      </div>
      <DropForm />
    </div>
  );
}
