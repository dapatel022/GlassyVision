export interface RxRejectedInput {
  orderNumber: string;
  customerEmail: string;
  /** Human-readable rejection reason (already de-coded from the enum). */
  reason: string;
  /** Optional free-text note the reviewer wrote for the customer. */
  notes: string | null;
  /** Fresh tokenized link to re-upload a prescription. */
  rxUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Customer-facing notice that an uploaded prescription was NOT accepted, with the
 * reason and a fresh link to re-upload. Sent on admin rejection so the customer
 * isn't left waiting on a stalled order with no explanation.
 */
export function renderRxRejected(input: RxRejectedInput): RenderedEmail {
  const subject = `Action needed: your prescription for order ${input.orderNumber}`;
  const reason = input.reason.replace(/_/g, ' ');

  const safeOrder = escapeHtml(input.orderNumber);
  const safeEmail = escapeHtml(input.customerEmail);
  const safeReason = escapeHtml(reason);
  const safeNotes = input.notes ? escapeHtml(input.notes) : null;
  const safeUrl = escapeHtml(input.rxUrl);

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <h1 style="font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.01em; margin: 0 0 24px 0;">GlassyVision</h1>
  <p style="font-size: 16px; line-height: 1.5;">We took a look at the prescription you uploaded for order ${safeOrder}, and unfortunately we can't use it yet.</p>
  <p style="font-size: 16px; line-height: 1.5;"><strong>Reason:</strong> ${safeReason}</p>
  ${safeNotes ? `<p style="font-size: 15px; line-height: 1.5; color: #444;">${safeNotes}</p>` : ''}
  <p style="margin: 24px 0;">
    <a href="${safeUrl}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #fff; text-decoration: none; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: 13px; border-radius: 6px;">Upload a new prescription</a>
  </p>
  <p style="color: #666; font-size: 14px; line-height: 1.5;">Your order is on hold until we receive a valid prescription — nothing has shipped. Reply to this email if you have any questions.</p>
  <p style="color: #999; font-size: 12px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">Order ${safeOrder} · sent to ${safeEmail}</p>
</body></html>`;

  const text = `We can't use the prescription you uploaded for order ${input.orderNumber} yet.\n\nReason: ${reason}\n${input.notes ? `\n${input.notes}\n` : ''}\nUpload a new prescription: ${input.rxUrl}\n\nYour order is on hold until we receive a valid prescription — nothing has shipped.\n`;

  return { subject, html, text };
}
