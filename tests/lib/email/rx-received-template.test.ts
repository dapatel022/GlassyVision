import { describe, it, expect } from 'vitest';
import { renderRxReceived } from '@/lib/email/templates/rx-received';

describe('renderRxReceived', () => {
  it('renders subject/html/text and includes the order number', () => {
    const r = renderRxReceived({ orderNumber: '#1042' });
    expect(r.subject).toContain('#1042');
    expect(r.html).toContain('review');
    expect(r.text).toContain('#1042');
  });
  it('degrades gracefully when order number is null', () => {
    const r = renderRxReceived({ orderNumber: null });
    expect(r.subject.length).toBeGreaterThan(0);
    expect(r.html).toContain('GlassyVision');
  });
});
