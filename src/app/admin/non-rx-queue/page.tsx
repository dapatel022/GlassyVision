import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/middleware';
import { redirect } from 'next/navigation';
import { getNonRxQueueItems } from '@/features/admin/lib/non-rx-queue';
import NonRxQueueClient from './client';

export const dynamic = 'force-dynamic';

export default async function NonRxQueuePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin/non-rx-queue');

  const supabase = createAdminClient();
  const items = await getNonRxQueueItems(supabase);

  return <NonRxQueueClient items={items} />;
}
