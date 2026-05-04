import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export interface AwaitingRxOrder {
  id: string;
  shopifyOrderNumber: string;
  customerEmail: string;
  createdAt: string;
  daysSinceOrder: number;
  remindersSent: number;
  lastReminderAt: string | null;
  lastReminderDay: number | null;
}

export async function listAwaitingRx(): Promise<AwaitingRxOrder[]> {
  const supabase = createAdminClient();

  const { data: orders } = await supabase
    .from('orders')
    .select('id, shopify_order_number, customer_email, created_at')
    .eq('rx_status', 'awaiting_upload')
    .order('created_at', { ascending: true });

  if (!orders || orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const { data: comms } = await supabase
    .from('communications')
    .select('order_id, sent_at, metadata')
    .in('order_id', orderIds)
    .eq('type', 'rx_reminder')
    .order('sent_at', { ascending: false, nullsFirst: false });

  const byOrder = new Map<string, { count: number; lastAt: string | null; lastDay: number | null }>();
  for (const c of comms ?? []) {
    if (!c.order_id) continue;
    const cur = byOrder.get(c.order_id) ?? { count: 0, lastAt: null, lastDay: null };
    cur.count += 1;
    if (cur.lastAt === null && c.sent_at) {
      cur.lastAt = c.sent_at;
      const meta = c.metadata as { reminder_day?: number } | null;
      cur.lastDay = typeof meta?.reminder_day === 'number' ? meta.reminder_day : null;
    }
    byOrder.set(c.order_id, cur);
  }

  const now = Date.now();
  return orders.map((o) => {
    const meta = byOrder.get(o.id) ?? { count: 0, lastAt: null, lastDay: null };
    const days = Math.floor((now - new Date(o.created_at).getTime()) / (24 * 60 * 60 * 1000));
    return {
      id: o.id,
      shopifyOrderNumber: o.shopify_order_number,
      customerEmail: o.customer_email,
      createdAt: o.created_at,
      daysSinceOrder: days,
      remindersSent: meta.count,
      lastReminderAt: meta.lastAt,
      lastReminderDay: meta.lastDay,
    };
  });
}
