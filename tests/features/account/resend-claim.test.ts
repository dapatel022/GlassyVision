import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) }),
}));
const sendEmail = vi.fn(() => Promise.resolve({ success: true, providerMessageId: null }));
vi.mock('@/lib/email/resend', () => ({ sendEmail }));
vi.mock('@/lib/auth/claim-token', () => ({ buildClaimUrl: () => 'https://glassyvision.com/account/claim?cid=cust-1&token=ab&exp=1' }));

beforeEach(() => { maybeSingle.mockReset(); sendEmail.mockClear(); process.env.NEXT_PUBLIC_APP_URL = 'https://glassyvision.com'; });

describe('resendClaimLink', () => {
  it('returns a generic ok and sends an email (with html + text) when an unclaimed customer matches', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'cust-1', email: 'a@b.com', auth_user_id: null }, error: null });
    const { resendClaimLink } = await import('@/features/account/actions/resend-claim');
    const res = await resendClaimLink('a@b.com');
    expect(res.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'a@b.com',
      subject: expect.any(String),
      html: expect.any(String),
      text: expect.any(String),
    }));
  });

  it('returns the same generic ok WITHOUT sending when no unclaimed match (no account enumeration)', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { resendClaimLink } = await import('@/features/account/actions/resend-claim');
    const res = await resendClaimLink('nobody@b.com');
    expect(res.success).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does NOT send to an already-claimed customer (no enumeration)', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'cust-1', email: 'a@b.com', auth_user_id: 'u-1' }, error: null });
    const { resendClaimLink } = await import('@/features/account/actions/resend-claim');
    const res = await resendClaimLink('a@b.com');
    expect(res.success).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
