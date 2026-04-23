import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/middleware';
import { createAdminClient } from '@/lib/supabase/admin';
import DropForm from '@/features/admin/drops/components/DropForm';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function EditDropPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { slug } = await params;
  if (slug === 'new') redirect('/admin/drops/new');

  const supabase = createAdminClient();
  const { data: drop } = await supabase
    .from('drops')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!drop) notFound();

  return (
    <div className="max-w-2xl">
      <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-6">
        Edit {drop.name}
      </h1>
      <DropForm existing={drop} />
    </div>
  );
}
