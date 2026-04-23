import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/middleware';
import { createAdminClient } from '@/lib/supabase/admin';
import InventoryTable from '@/features/admin/inventory/components/InventoryTable';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin/inventory');

  const supabase = createAdminClient();
  const { data: pool } = await supabase
    .from('inventory_pool')
    .select('id, sku, frame_shape, color, size, pool_quantity, threshold_alert, last_updated_at')
    .order('sku');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink">Inventory pool</h1>
          <p className="text-sm text-muted font-serif italic">{pool?.length ?? 0} SKUs tracked</p>
        </div>
      </div>
      <InventoryTable rows={pool ?? []} userId={user.id} />
    </div>
  );
}
