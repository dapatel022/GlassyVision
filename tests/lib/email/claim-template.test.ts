import { describe, it, expect } from 'vitest';
import { renderClaimEmail } from '@/lib/email/claim-template';

describe('renderClaimEmail', () => {
  it('includes the claim URL', () => {
    const html = renderClaimEmail('https://glassyvision.com/account/claim?cid=cust-1&token=ab&exp=1');
    expect(html).toContain('https://glassyvision.com/account/claim?cid=cust-1&token=ab&exp=1');
    expect(html).toContain('Manage your');
  });
});
