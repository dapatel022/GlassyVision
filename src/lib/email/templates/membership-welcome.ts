import { type RenderedEmail, escapeHtml, emailShell } from './shared';

export interface MembershipWelcomeInput {
  memberName: string;
  pairsTotal: number;
  manageUrl: string;
}

/** Sent once when a subscription membership is provisioned from a paid order. */
export function renderMembershipWelcome(input: MembershipWelcomeInput): RenderedEmail {
  const { memberName, pairsTotal, manageUrl } = input;
  const subject = `Welcome to your GlassyVision membership`;

  const safeName = escapeHtml(memberName);
  const safeUrl = escapeHtml(manageUrl);

  const html = emailShell({
    lead: `Welcome, ${safeName}. Your GlassyVision membership is active — it covers <strong>${pairsTotal}</strong> pair${pairsTotal === 1 ? '' : 's'} this term. Pick your frames and redeem whenever you're ready.`,
    ctaHref: safeUrl,
    ctaLabel: 'Manage your membership',
    footnote: `You can redeem your pairs any time before your term ends.`,
  });

  const text = `Welcome, ${memberName}.

Your GlassyVision membership is active and covers ${pairsTotal} pair${pairsTotal === 1 ? '' : 's'} this term. Pick your frames and redeem whenever you're ready.

Manage your membership: ${manageUrl}
`;

  return { subject, html, text };
}
