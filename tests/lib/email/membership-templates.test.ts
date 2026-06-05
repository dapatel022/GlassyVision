import { describe, it, expect } from 'vitest';
import { renderMembershipWelcome } from '@/lib/email/templates/membership-welcome';
import { renderSlotUnlocked } from '@/lib/email/templates/slot-unlocked';
import { renderPairShipped } from '@/lib/email/templates/pair-shipped';
import { renderExpiryWarning } from '@/lib/email/templates/expiry-warning';
import { renderRenewalOffer } from '@/lib/email/templates/renewal-offer';

// No unrendered `${...}` or `{token}` placeholders should ever reach the wire.
function assertNoUnrendered(s: string) {
  expect(s).not.toMatch(/\$\{/);
  expect(s).not.toMatch(/\{[a-zA-Z_]\w*\}/);
}

function assertCommon(out: { subject: string; html: string; text: string }) {
  expect(out.subject).toBeTruthy();
  expect(out.html).toBeTruthy();
  expect(out.text).toBeTruthy();
  // Brand present, competitor name never present.
  expect(out.html).toContain('GlassyVision');
  expect(out.html.toLowerCase()).not.toContain('lensabl');
  expect(out.text.toLowerCase()).not.toContain('lensabl');
  expect(out.subject.toLowerCase()).not.toContain('lensabl');
  // No leftover placeholders in the plain-text body.
  assertNoUnrendered(out.text);
}

describe('renderMembershipWelcome', () => {
  const base = {
    memberName: 'Dev Patel',
    pairsTotal: 3,
    manageUrl: 'https://glassyvision.com/account/subscription?a=1&b=2',
  };

  it('returns subject/html/text and greets the member by name', () => {
    const out = renderMembershipWelcome(base);
    assertCommon(out);
    expect(out.html).toContain('Dev Patel');
    expect(out.text).toContain('Dev Patel');
    expect(out.subject.toLowerCase()).toMatch(/welcome|membership/);
  });

  it('mentions the number of pairs covered', () => {
    const out = renderMembershipWelcome(base);
    expect(out.html).toContain('3');
    expect(out.text).toContain('3');
  });

  it('entity-encodes the manage URL in html but leaves it raw in text', () => {
    const out = renderMembershipWelcome(base);
    expect(out.html).toContain('https://glassyvision.com/account/subscription?a=1&amp;b=2');
    expect(out.text).toContain(base.manageUrl);
  });

  it('html-escapes the member name to prevent injection', () => {
    const out = renderMembershipWelcome({
      ...base,
      memberName: '<script>alert(1)</script>',
    });
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
  });
});

describe('renderSlotUnlocked', () => {
  const base = {
    memberName: 'Dev',
    redeemUrl: 'https://glassyvision.com/account/subscription/redeem/slot-1?t=x&u=y',
  };

  it('returns subject/html/text with the redeem link', () => {
    const out = renderSlotUnlocked(base);
    assertCommon(out);
    expect(out.html).toContain('https://glassyvision.com/account/subscription/redeem/slot-1?t=x&amp;u=y');
    expect(out.text).toContain(base.redeemUrl);
    expect(out.subject.toLowerCase()).toMatch(/pair|slot|redeem|ready/);
  });

  it('escapes the member name', () => {
    const out = renderSlotUnlocked({ ...base, memberName: '<b>x</b>' });
    expect(out.html).not.toContain('<b>x</b>');
    expect(out.html).toContain('&lt;b&gt;');
  });
});

describe('renderPairShipped', () => {
  const base = {
    trackingUrl: 'https://glassyvision.com/track/ord-1?k=v&w=z',
    carrier: 'USPS',
    trackingNumber: '9400111899',
  };

  it('returns subject/html/text with the tracking link', () => {
    const out = renderPairShipped(base);
    assertCommon(out);
    expect(out.html).toContain('https://glassyvision.com/track/ord-1?k=v&amp;w=z');
    expect(out.text).toContain(base.trackingUrl);
    expect(out.subject.toLowerCase()).toMatch(/ship|on its way|track/);
  });

  it('includes the carrier and tracking number', () => {
    const out = renderPairShipped(base);
    expect(out.html).toContain('USPS');
    expect(out.html).toContain('9400111899');
    expect(out.text).toContain('9400111899');
  });

  it('renders without a tracking number when none is provided', () => {
    const out = renderPairShipped({ trackingUrl: base.trackingUrl });
    assertCommon(out);
    expect(out.html).toContain('track/ord-1');
  });
});

describe('renderExpiryWarning', () => {
  const base = {
    daysLeft: 7,
    manageUrl: 'https://glassyvision.com/account/subscription?x=1&y=2',
  };

  it('returns subject/html/text noting the days left', () => {
    const out = renderExpiryWarning(base);
    assertCommon(out);
    expect(out.subject).toContain('7');
    expect(out.html).toContain('7');
    expect(out.html).toContain('https://glassyvision.com/account/subscription?x=1&amp;y=2');
    expect(out.text).toContain(base.manageUrl);
  });

  it('uses singular day when one day left', () => {
    const out = renderExpiryWarning({ ...base, daysLeft: 1 });
    expect(out.subject).toMatch(/1 day\b/);
    expect(out.subject).not.toMatch(/1 days/);
  });
});

describe('renderRenewalOffer', () => {
  const base = {
    renewUrl: 'https://glassyvision.com/account/subscription?renew=1&z=2',
  };

  it('returns subject/html/text with the renewal CTA', () => {
    const out = renderRenewalOffer(base);
    assertCommon(out);
    expect(out.html).toContain('https://glassyvision.com/account/subscription?renew=1&amp;z=2');
    expect(out.text).toContain(base.renewUrl);
    expect(out.subject.toLowerCase()).toMatch(/renew|ended|membership/);
    expect(out.html.toLowerCase()).toContain('renew');
  });
});
