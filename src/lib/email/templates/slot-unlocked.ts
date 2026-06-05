import { type RenderedEmail, escapeHtml, emailShell } from './shared';

export interface SlotUnlockedInput {
  memberName: string;
  redeemUrl: string;
}

/** Sent when a redemption slot becomes available (past its unlocks_at). */
export function renderSlotUnlocked(input: SlotUnlockedInput): RenderedEmail {
  const { memberName, redeemUrl } = input;
  const subject = `A new GlassyVision pair is ready to redeem`;

  const safeName = escapeHtml(memberName);
  const safeUrl = escapeHtml(redeemUrl);

  const html = emailShell({
    lead: `Good news, ${safeName} — one of your membership pairs has unlocked. Choose your frames and we'll start making your lenses.`,
    ctaHref: safeUrl,
    ctaLabel: 'Redeem your pair',
  });

  const text = `Good news, ${memberName} — one of your membership pairs has unlocked. Choose your frames and we'll start making your lenses.

Redeem your pair: ${redeemUrl}
`;

  return { subject, html, text };
}
