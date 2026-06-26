import { describe, it, expect } from 'vitest';
import { renderRxApproved } from '@/lib/email/templates/rx-approved';

describe('renderRxApproved', () => {
  it('renders and includes order number + orders link', () => {
    const r = renderRxApproved({ orderNumber: '#1042', ordersUrl: 'https://glassyvision.com/account/orders' });
    expect(r.subject).toContain('#1042');
    expect(r.html).toContain('https://glassyvision.com/account/orders');
    expect(r.text.toLowerCase()).toContain('approved');
  });
  it('degrades gracefully without an order number', () => {
    const r = renderRxApproved({ orderNumber: null, ordersUrl: 'https://glassyvision.com/account/orders' });
    expect(r.subject.length).toBeGreaterThan(0);
  });
});
