import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/middleware';
import { createAdminClient } from '@/lib/supabase/admin';
import ReturnDetail from '@/features/admin/returns/components/ReturnDetail';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReturnDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin/returns');

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: ret } = await supabase
    .from('returns')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!ret) notFound();

  const { data: order } = await supabase
    .from('orders')
    .select('shopify_order_number, customer_name, total')
    .eq('id', ret.order_id)
    .single();

  const { data: lineItem } = ret.line_item_id
    ? await supabase
        .from('order_line_items')
        .select('product_title, variant_title, line_total')
        .eq('id', ret.line_item_id)
        .single()
    : { data: null };

  return (
    <ReturnDetail
      ret={ret}
      order={order ?? { shopify_order_number: '—', customer_name: '—', total: 0 }}
      lineItem={lineItem}
      reviewerUserId={user.id}
    />
  );
}
