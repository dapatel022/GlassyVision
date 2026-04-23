'use server';

import { createAdminClient } from '@/lib/supabase/admin';

export interface CreateShipmentInput {
  jobId: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
}

export async function createShipment(input: CreateShipmentInput): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { data: job } = await supabase
    .from('lab_jobs')
    .select('id, work_order_id')
    .eq('id', input.jobId)
    .maybeSingle();
  if (!job) return { success: false, error: 'Job not found' };

  const { data: wo } = await supabase
    .from('work_orders')
    .select('order_id')
    .eq('id', job.work_order_id)
    .single();
  if (!wo) return { success: false, error: 'Work order not found' };

  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .insert({
      order_id: wo.order_id,
      direction: 'outbound',
      carrier: input.carrier,
      tracking_number: input.trackingNumber,
      tracking_url: input.trackingUrl ?? null,
      status: 'in_transit',
      shipped_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (shipErr || !shipment) return { success: false, error: 'Failed to create shipment' };

  await supabase
    .from('lab_jobs')
    .update({ shipment_id: shipment.id, completed_at: new Date().toISOString() })
    .eq('id', input.jobId);

  await supabase
    .from('orders')
    .update({ fulfillment_status: 'shipped' })
    .eq('id', wo.order_id);

  return { success: true };
}
