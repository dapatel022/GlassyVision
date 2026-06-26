import { type RenderedEmail, escapeHtml, emailShell } from './shared';

/** Sent once when a customer uploads their prescription (submitRx success).
 *  Reassures them the upload landed and is queued for our manual review.
 *  Shopify never sends this — it has no knowledge of our Rx review state. */
export function renderRxReceived(input: { orderNumber: string | null }): RenderedEmail {
  const order = input.orderNumber ?? '';
  const subject = order ? `We've got your prescription — order ${order}` : `We've got your prescription`;
  const safeOrder = escapeHtml(order);
  const lead = `Thanks — we've received your prescription${safeOrder ? ` for order <strong>${safeOrder}</strong>` : ''} and it's now in our review queue. A team member checks every prescription by hand before we make your lenses; we'll email you the moment it's approved.`;
  const html = emailShell({ lead, footnote: `No action needed right now. We'll be in touch shortly.` });
  const text = `Thanks — we've received your prescription${order ? ` for order ${order}` : ''} and it's now in our review queue.

A team member checks every prescription by hand before we make your lenses. We'll email you the moment it's approved — no action needed right now.
`;
  return { subject, html, text };
}
