import { type RenderedEmail, escapeHtml, emailShell } from './shared';

export interface PairShippedInput {
  trackingUrl: string;
  carrier?: string;
  trackingNumber?: string;
}

/** Sent when a subscription redemption pair reaches `shipped`. */
export function renderPairShipped(input: PairShippedInput): RenderedEmail {
  const { trackingUrl, carrier, trackingNumber } = input;
  const subject = `Your GlassyVision pair is on its way`;

  const safeUrl = escapeHtml(trackingUrl);
  const carrierLine =
    carrier || trackingNumber
      ? ` ${escapeHtml(carrier ?? 'Carrier')}${trackingNumber ? ` &middot; ${escapeHtml(trackingNumber)}` : ''}`
      : '';

  const html = emailShell({
    lead: `Your latest GlassyVision pair has shipped and is on its way.${carrierLine ? `<br/><span style="color:#666;font-size:14px;">Tracking:${carrierLine}</span>` : ''}`,
    ctaHref: safeUrl,
    ctaLabel: 'Track your shipment',
  });

  const carrierText =
    carrier || trackingNumber
      ? `\nTracking: ${carrier ?? 'Carrier'}${trackingNumber ? ` - ${trackingNumber}` : ''}`
      : '';

  const text = `Your latest GlassyVision pair has shipped and is on its way.${carrierText}

Track your shipment: ${trackingUrl}
`;

  return { subject, html, text };
}
