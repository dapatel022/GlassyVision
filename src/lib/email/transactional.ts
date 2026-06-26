import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import type { RenderedEmail } from '@/lib/email/templates/shared';
import { sendEmail } from '@/lib/email/resend';

type CommType = Database['public']['Enums']['comm_type'];

/**
 * Send an order-bound transactional email at most once. Dedup is by
 * (order_id, type) over outbound, non-failed `communications` rows — so a retry,
 * double-submit, or webhook replay can't double-send. Pre-claims a `queued` row,
 * sends, then records `sent`/`failed`. Best-effort: never throws into the caller.
 */
export async function sendOrderEmailOnce(opts: {
  supabase: SupabaseClient<Database>;
  orderId: string;
  customerEmail: string;
  type: CommType;
  rendered: RenderedEmail;
}): Promise<{ sent: boolean; reason?: 'duplicate' | 'send_failed' | 'error' }> {
  const { supabase, orderId, customerEmail, type, rendered } = opts;
  try {
    const { data: prior } = await supabase
      .from('communications')
      .select('id, status')
      .eq('order_id', orderId)
      .eq('type', type)
      .eq('direction', 'outbound')
      .neq('status', 'failed')
      .maybeSingle();
    if (prior) return { sent: false, reason: 'duplicate' };

    const { data: claim, error: claimErr } = await supabase
      .from('communications')
      .insert({ order_id: orderId, customer_email: customerEmail, direction: 'outbound' as const, type, subject: rendered.subject, status: 'queued' })
      .select('id')
      .single();
    if (claimErr) {
      // 23505 = the partial unique index fired: a concurrent or prior claim won.
      // Treat as a duplicate and do NOT send a second email.
      if (claimErr.code === '23505') return { sent: false, reason: 'duplicate' };
      console.error('[transactional] claim insert failed', { orderId, type, error: claimErr });
      return { sent: false, reason: 'error' };
    }

    const res = await sendEmail({ to: customerEmail, subject: rendered.subject, html: rendered.html, text: rendered.text });

    if (claim?.id) {
      await supabase
        .from('communications')
        .update(
          res.success
            ? { status: 'sent', provider_message_id: res.providerMessageId, sent_at: new Date().toISOString() }
            : { status: 'failed' },
        )
        .eq('id', claim.id);
    }
    return res.success ? { sent: true } : { sent: false, reason: 'send_failed' };
  } catch (e) {
    console.error('[transactional] send failed', { orderId, type, error: e });
    return { sent: false, reason: 'error' };
  }
}
