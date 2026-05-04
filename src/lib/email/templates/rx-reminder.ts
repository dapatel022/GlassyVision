export interface RxReminderInput {
  orderNumber: string;
  customerEmail: string;
  rxUrl: string;
  reminderDay: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface DayCopy {
  subject: string;
  lead: string;
  outro: string;
}

function copyForDay(day: number): DayCopy {
  if (day <= 3) {
    return {
      subject: `Your GlassyVision order {orderNumber} — upload your prescription`,
      lead: `Quick reminder — we still need your prescription to start making your lenses.`,
      outro: `Takes about a minute. We'll hold your order until you upload.`,
    };
  }
  if (day <= 14) {
    return {
      subject: `Still holding order {orderNumber} for your prescription`,
      lead: `Your order is on hold — we just need a photo or PDF of your prescription before we can make your lenses.`,
      outro: `If you've lost it, ask your eye doctor for a copy (they're required to give you one).`,
    };
  }
  if (day <= 60) {
    return {
      subject: `Reminder: order {orderNumber} is still waiting on your prescription`,
      lead: `It's been a while since you placed order {orderNumber}. We're still holding it for you.`,
      outro: `If something's blocking you, reply to this email and we'll reach out to figure it out together.`,
    };
  }
  return {
    subject: `Order {orderNumber}: still holding — please upload or let us know`,
    lead: `We're still holding order {orderNumber}. If you don't intend to complete it, reply to this email and our team will reach out about a refund.`,
    outro: `Otherwise, upload your prescription any time using the link below.`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function fillTemplate(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export function renderRxReminder(input: RxReminderInput): RenderedEmail {
  const copy = copyForDay(input.reminderDay);
  const vars = { orderNumber: input.orderNumber };
  const subject = fillTemplate(copy.subject, vars);
  const lead = fillTemplate(copy.lead, vars);
  const outro = fillTemplate(copy.outro, vars);

  const safeOrder = escapeHtml(input.orderNumber);
  const safeEmail = escapeHtml(input.customerEmail);
  const safeUrl = escapeAttr(input.rxUrl);
  const safeLead = fillTemplate(escapeHtml(copy.lead), { orderNumber: safeOrder });
  const safeOutro = fillTemplate(escapeHtml(copy.outro), { orderNumber: safeOrder });

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <h1 style="font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.01em; margin: 0 0 24px 0;">GlassyVision</h1>
  <p style="font-size: 16px; line-height: 1.5;">${safeLead}</p>
  <p style="margin: 24px 0;">
    <a href="${safeUrl}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #fff; text-decoration: none; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: 13px; border-radius: 6px;">Upload your prescription</a>
  </p>
  <p style="color: #666; font-size: 14px; line-height: 1.5;">${safeOutro}</p>
  <p style="color: #999; font-size: 12px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">Order ${safeOrder} · sent to ${safeEmail}</p>
</body></html>`;

  const text = `${lead}\n\nUpload here: ${input.rxUrl}\n\n${outro}\n\nOrder ${input.orderNumber}\n`;

  return { subject, html, text };
}
