import { type RenderedEmail, escapeHtml, emailShell } from './shared';

/** Sent once when an admin approves an uploaded prescription (reviewRx → approved).
 *  Fires for both one-time orders and synthesized subscription-redemption orders
 *  (both flow through reviewRx). Closes the silent gap between upload and ship. */
export function renderRxApproved(input: { orderNumber: string | null; ordersUrl: string }): RenderedEmail {
  const order = input.orderNumber ?? '';
  const subject = order ? `Prescription approved — order ${order} is in production` : `Your prescription is approved — we're making your lenses`;
  const safeOrder = escapeHtml(order);
  const safeUrl = escapeHtml(input.ordersUrl);
  const lead = `Good news — your prescription${safeOrder ? ` for order <strong>${safeOrder}</strong>` : ''} passed review and our lab is now crafting your lenses. You'll get a shipping confirmation with tracking as soon as it's on its way.`;
  const html = emailShell({ lead, ctaHref: safeUrl, ctaLabel: 'View your orders', footnote: `Typical lab turnaround is a few business days.` });
  const text = `Good news — your prescription${order ? ` for order ${order}` : ''} has been approved. Our lab is now crafting your lenses.

You'll get a shipping confirmation with tracking as soon as it's on its way.

View your orders: ${input.ordersUrl}
`;
  return { subject, html, text };
}
