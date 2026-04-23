import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get('orderId');
  if (!orderId) {
    return NextResponse.json({ error: 'orderId required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('orders')
    .select('id')
    .eq('shopify_order_number', orderId)
    .maybeSingle();

  return NextResponse.json({ exists: !!data });
}
