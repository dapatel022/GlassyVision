import { type RenderedEmail, escapeHtml, emailShell } from './shared';

export interface RenewalOfferInput {
  renewUrl: string;
}

/** Sent from the membership-expiry cron when a term ends (expire/refund modes). */
export function renderRenewalOffer(input: RenewalOfferInput): RenderedEmail {
  const { renewUrl } = input;
  const subject = `Your GlassyVision membership has ended — renew for another year`;

  const safeUrl = escapeHtml(renewUrl);

  const html = emailShell({
    lead: `Your membership term has ended. Renew to keep getting fresh frames every term.`,
    ctaHref: safeUrl,
    ctaLabel: 'Renew membership',
  });

  const text = `Your GlassyVision membership term has ended. Renew to keep getting fresh frames every term.

Renew membership: ${renewUrl}
`;

  return { subject, html, text };
}
