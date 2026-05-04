import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
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

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const got = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorize(request)) {
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
    console.error('[rx-reminder] orders query failed', ordersError);
    return NextResponse.json(
      { error: 'orders query failed', detail: ordersError.message },
      { status: 500 },
    );
  }

  let sent = 0;
  let skipped = 0;
  const errors: CronError[] = [];

  for (const order of orders ?? []) {
    try {
      const created = new Date(order.created_at).getTime();
      const daysSinceOrder = Math.floor((now - created) / (24 * 60 * 60 * 1000));

      const { data: priorComms, error: commsError } = await supabase
        .from('communications')
        .select('metadata, status')
        .eq('order_id', order.id)
        .eq('type', 'rx_reminder')
        .eq('direction', 'outbound');

      if (commsError) {
        errors.push({ orderId: order.id, error: `comms query: ${commsError.message}` });
        continue;
      }

      // Successfully-sent or in-flight reminders count toward sentDays.
      // 'failed' rows do not — those have metadata cleared and the unique
      // slot is open so the next cron tick can retry.
      const sentDays: number[] = (priorComms ?? [])
        .filter((c) => c.status !== 'failed')
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

      // Pre-claim the (order, day) slot via the partial unique index. A
      // concurrent cron run that already inserted will fail here BEFORE
      // we send, preventing duplicate emails.
      const { data: claimed, error: claimError } = await supabase
        .from('communications')
        .insert({
          order_id: order.id,
          customer_email: order.customer_email,
          type: 'rx_reminder',
          direction: 'outbound',
          channel: 'email',
          provider: 'resend',
          subject: rendered.subject,
          status: 'queued',
          metadata: { reminder_day: next },
        })
        .select('id')
        .single();

      if (claimError || !claimed) {
        errors.push({
          orderId: order.id,
          error: `claim slot: ${claimError?.message ?? 'no row returned'}`,
        });
        continue;
      }

      const sendResult = await sendEmail({
        to: order.customer_email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (sendResult.success) {
        const { error: updateError } = await supabase
          .from('communications')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            provider_message_id: sendResult.providerMessageId,
          })
          .eq('id', claimed.id);

        if (updateError) {
          // Email went out but we couldn't mark it sent. The slot is still
          // claimed (queued) so we won't re-send; a future cron tick will
          // see status='queued' as occupied. Surface the error so an
          // operator can reconcile.
          errors.push({
            orderId: order.id,
            error: `update sent: ${updateError.message} (email delivered, DB out of sync)`,
          });
        }
        sent++;
      } else {
        // Clear metadata.reminder_day so the partial unique index releases
        // the slot — next cron tick will retry. Keep the row for audit.
        await supabase
          .from('communications')
          .update({
            status: 'failed',
            metadata: { failed_error: sendResult.error, original_reminder_day: next },
          })
          .eq('id', claimed.id);

        errors.push({ orderId: order.id, error: sendResult.error });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      console.error('[rx-reminder] iteration crashed', { orderId: order.id, error: message });
      errors.push({ orderId: order.id, error: `crash: ${message}` });
    }
  }

  const hasErrors = errors.length > 0;
  if (hasErrors) {
    console.error('[rx-reminder] completed with errors', {
      sent,
      skipped,
      errorCount: errors.length,
      errors,
    });
  }

  return NextResponse.json(
    { success: !hasErrors, sent, skipped, errors },
    { status: hasErrors ? 500 : 200 },
  );
}
