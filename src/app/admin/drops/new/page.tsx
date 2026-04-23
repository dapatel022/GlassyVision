import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/middleware';
import DropForm from '@/features/admin/drops/components/DropForm';

export const dynamic = 'force-dynamic';

export default async function NewDropPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin/drops/new');

  return (
    <div className="max-w-2xl">
      <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-6">New drop</h1>
      <DropForm />
    </div>
  );
}
