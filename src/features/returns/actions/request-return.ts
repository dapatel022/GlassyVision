'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { verifyRxToken } from '@/features/rx-intake/lib/rx-token';
import type { Database } from '@/lib/supabase/types';

type ReturnRequestType = Database['public']['Enums']['return_request_type'];
type ReturnReason = Database['public']['Enums']['return_reason'];
type ReturnResolution = Database['public']['Enums']['return_resolution'];

export interface RequestReturnInput {
  /** Order DB UUID. */
  orderId: string;
  /** Public order number the token is signed over (binds the request to the link). */
  publicOrderId: string;
  /** HMAC token + expiry from the return link. */
  token: string;
  exp: number;
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
  // Auth: re-verify the same HMAC token the page checked. Without this, anyone
  // with a guessed order UUID could file returns with attacker-controlled photos.
  if (!verifyRxToken(input.publicOrderId, input.token, input.exp)) {
    return { success: false, error: 'Invalid or expired link' };
  }

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, customer_email, shopify_order_number')
    .eq('id', input.orderId)
    .maybeSingle();

  // The order UUID must resolve to the same order the token was signed over.
  if (!order || order.shopify_order_number !== input.publicOrderId) {
    return { success: false, error: 'Order not found' };
  }

  // The line item being returned must belong to this order (no cross-order refs).
  const { data: lineItem } = await supabase
    .from('order_line_items')
    .select('id')
    .eq('id', input.lineItemId)
    .eq('order_id', order.id)
    .maybeSingle();
  if (!lineItem) return { success: false, error: 'Line item not found on this order' };

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
