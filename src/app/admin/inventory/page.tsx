import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, isAdminRole } from '@/lib/auth/middleware';
import { createAdminClient } from '@/lib/supabase/admin';
import InventoryTable from '@/features/admin/inventory/components/InventoryTable';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin/inventory');
  if (!isAdminRole(user.role)) redirect('/unauthorized');

  const supabase = createAdminClient();
  const { data: pool } = await supabase
    .from('inventory_pool')
    .select('id, sku, frame_shape, color, size, pool_quantity, threshold_alert, last_updated_at')
    .order('sku');

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-xs font-mono text-accent hover:underline uppercase tracking-wider font-bold">
          ← Back to Dashboard
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink">Inventory pool</h1>
          <p className="text-sm text-muted font-serif italic">{pool?.length ?? 0} SKUs tracked</p>
        </div>
      </div>
      <InventoryTable rows={pool ?? []} />
    </div>
  );
}
