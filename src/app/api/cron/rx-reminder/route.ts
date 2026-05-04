import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/resend';
import { renderRxReminder } from '@/lib/email/templates/rx-reminder';
import { selectNextReminderDay } from '@/lib/rx-reminder/select-next';
import { generateRxToken } from '@/features/rx-intake/lib/rx-token';

export const dynamic = 'force-dynamic';

interface CronError {
  orderId: string;
  error: string;
}

export async function GET(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  const got = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!expected || got !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://glassyvision.com';
  const now = Date.now();

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, shopify_order_number, customer_email, created_at')
    .eq('rx_status', 'awaiting_upload');

  if (ordersError) {
    return NextResponse.json(
      { error: 'orders query failed', detail: ordersError.message },
      { status: 500 },
    );
  }

  let sent = 0;
  let skipped = 0;
  const errors: CronError[] = [];

  for (const order of orders ?? []) {
    const created = new Date(order.created_at).getTime();
    const daysSinceOrder = Math.floor((now - created) / (24 * 60 * 60 * 1000));

    const { data: priorComms, error: commsError } = await supabase
      .from('communications')
      .select('metadata')
      .eq('order_id', order.id)
      .eq('type', 'rx_reminder');

    if (commsError) {
      errors.push({ orderId: order.id, error: `comms query: ${commsError.message}` });
      continue;
    }

    const sentDays: number[] = (priorComms ?? [])
      .map((c) => Number((c.metadata as { reminder_day?: number } | null)?.reminder_day))
      .filter((n) => Number.isFinite(n));

    const next = selectNextReminderDay(daysSinceOrder, sentDays);
    if (next === null) {
      skipped++;
      continue;
    }

    const { token, exp } = generateRxToken(order.shopify_order_number);
    const rxUrl = `${baseUrl}/rx/${order.shopify_order_number}?token=${token}&exp=${exp}`;
    const rendered = renderRxReminder({
      orderNumber: order.shopify_order_number,
      customerEmail: order.customer_email,
      rxUrl,
      reminderDay: next,
    });

    const sendResult = await sendEmail({
      to: order.customer_email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    const { error: insertError } = await supabase.from('communications').insert({
      order_id: order.id,
      customer_email: order.customer_email,
      type: 'rx_reminder',
      provider: 'resend',
      provider_message_id: sendResult.success ? sendResult.providerMessageId : null,
      subject: rendered.subject,
      status: sendResult.success ? 'sent' : 'failed',
      sent_at: sendResult.success ? new Date().toISOString() : null,
      metadata: { reminder_day: next },
    });

    if (insertError) {
      errors.push({ orderId: order.id, error: `comms insert: ${insertError.message}` });
      continue;
    }

    if (sendResult.success) sent++;
    else errors.push({ orderId: order.id, error: sendResult.error });
  }

  return NextResponse.json({ success: true, sent, skipped, errors });
}
