import { describe, it, expect } from 'vitest';
import { renderClaimEmail, renderClaimEmailText } from '@/lib/email/claim-template';

const URL = 'https://glassyvision.com/account/claim?cid=cust-1&token=ab&exp=1';

describe('renderClaimEmail', () => {
  it('includes the claim URL', () => {
    const html = renderClaimEmail(URL);
    expect(html).toContain(URL);
    expect(html).toContain('Manage your');
  });
});

describe('renderClaimEmailText', () => {
  it('includes the claim URL in the plain-text body', () => {
    const text = renderClaimEmailText(URL);
    expect(text).toContain(URL);
    expect(text).toContain('Manage your');
  });
});
