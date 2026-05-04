import { describe, it, expect } from 'vitest';
import { renderRxReminder } from '@/lib/email/templates/rx-reminder';

describe('renderRxReminder', () => {
  const base = {
    orderNumber: 'GV-1001',
    customerEmail: 'c@x.com',
    rxUrl: 'https://glassyvision.com/rx/GV-1001?token=abc&exp=123',
  };

  it('returns subject, html, and text', () => {
    const out = renderRxReminder({ ...base, reminderDay: 1 });
    expect(out.subject).toBeTruthy();
    expect(out.html).toContain('GV-1001');
    // HTML attribute context: ampersands must be entity-encoded.
    expect(out.html).toContain('https://glassyvision.com/rx/GV-1001?token=abc&amp;exp=123');
    // Plain text: ampersand stays as-is.
    expect(out.text).toContain(base.rxUrl);
  });

  it('html-escapes the order number to prevent injection', () => {
    const out = renderRxReminder({
      orderNumber: 'GV-<script>alert(1)</script>',
      customerEmail: 'c@x.com',
      rxUrl: 'https://x/y',
      reminderDay: 1,
    });
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
  });

  it('day 1 copy is friendly and mentions the prescription', () => {
    const out = renderRxReminder({ ...base, reminderDay: 1 });
    expect(out.subject.toLowerCase()).toContain('prescription');
    expect(out.html.toLowerCase()).not.toContain('refund');
  });

  it('day 60 copy is more urgent and notes admin will follow up', () => {
    const out = renderRxReminder({ ...base, reminderDay: 60 });
    expect(out.subject.toLowerCase()).toMatch(/still|reminder|holding|waiting/);
    expect(out.html.toLowerCase()).toContain('reach out');
  });

  it('day 90 copy invites a refund conversation but does not auto-cancel', () => {
    const out = renderRxReminder({ ...base, reminderDay: 90 });
    expect(out.html.toLowerCase()).toContain('refund');
    expect(out.html.toLowerCase()).not.toMatch(/we have cancell?ed|order cancell?ed/);
  });

  it('escapes the order number into the subject and body', () => {
    const out = renderRxReminder({ ...base, reminderDay: 14 });
    expect(out.subject).toContain('GV-1001');
    expect(out.html).toContain('GV-1001');
  });

  it('never uses the LENSABL name (CLAUDE.md rule)', () => {
    const out = renderRxReminder({ ...base, reminderDay: 14 });
    expect(out.html.toLowerCase()).not.toContain('lensabl');
    expect(out.text.toLowerCase()).not.toContain('lensabl');
    expect(out.subject.toLowerCase()).not.toContain('lensabl');
  });
});
