import { type RenderedEmail, escapeHtml, emailShell } from './shared';

export interface ExpiryWarningInput {
  daysLeft: number;
  manageUrl: string;
}

/** Sent from the membership-expiry cron as a term-end approaches. */
export function renderExpiryWarning(input: ExpiryWarningInput): RenderedEmail {
  const { daysLeft, manageUrl } = input;
  const dayWord = `${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
  const subject = `Your GlassyVision membership ends in ${dayWord}`;

  const safeUrl = escapeHtml(manageUrl);

  const html = emailShell({
    lead: `Your membership term ends in <strong>${dayWord}</strong>. Redeem any remaining pairs before then so you don't miss out.`,
    ctaHref: safeUrl,
    ctaLabel: 'Redeem your pairs',
  });

  const text = `Your GlassyVision membership term ends in ${dayWord}. Redeem any remaining pairs before then.

Redeem your pairs: ${manageUrl}
`;

  return { subject, html, text };
}
