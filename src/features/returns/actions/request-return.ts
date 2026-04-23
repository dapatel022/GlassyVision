'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/types';

type ReturnRequestType = Database['public']['Enums']['return_request_type'];
type ReturnReason = Database['public']['Enums']['return_reason'];
type ReturnResolution = Database['public']['Enums']['return_resolution'];

export interface RequestReturnInput {
  orderId: string;
  lineItemId: string;
  requestType: ReturnRequestType;
  reason: ReturnReason;
  reasonDetail: string;
  preferredResolution: ReturnResolution | null;
  photoUrls: string[];
}

export type RequestReturnResult =
  | { success: true; rmaNumber: string; returnId: string }
  | { success: false; error: string };

function buildRmaNumber(seq: number): string {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `RMA-${yyyymm}-${String(seq).padStart(3, '0')}`;
}

export async function requestReturn(input: RequestReturnInput): Promise<RequestReturnResult> {
  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, customer_email, shopify_order_number')
    .eq('id', input.orderId)
    .maybeSingle();

  if (!order) return { success: false, error: 'Order not found' };

  const { count } = await supabase
    .from('returns')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

  const rmaNumber = buildRmaNumber((count ?? 0) + 1);

  const { data: inserted, error } = await supabase
    .from('returns')
    .insert({
      order_id: input.orderId,
      line_item_id: input.lineItemId,
      customer_email: order.customer_email,
      rma_number: rmaNumber,
      request_type: input.requestType,
      reason: input.reason,
      reason_detail: input.reasonDetail || null,
      preferred_resolution: input.preferredResolution,
      photo_urls: input.photoUrls as unknown as Database['public']['Tables']['returns']['Insert']['photo_urls'],
      status: 'pending',
      admin_decision: 'pending',
    })
    .select('id')
    .single();

  if (error || !inserted) return { success: false, error: 'Failed to create return request' };

  return { success: true, rmaNumber, returnId: inserted.id };
}
