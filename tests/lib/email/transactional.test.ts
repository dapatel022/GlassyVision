import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendEmailMock = vi.fn();
vi.mock('@/lib/email/resend', () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }));

import { sendOrderEmailOnce } from '@/lib/email/transactional';

const rendered = { subject: 'S', html: '<p>h</p>', text: 't' };

/** Minimal chainable Supabase stub: control what the dedup SELECT returns and
 *  capture inserts/updates. */
function makeSupabase(existing: unknown) {
  const inserted: unknown[] = [];
  const client = {
    from() { return this; },
    select() { return this; },
    eq() { return this; },
    neq() { return this; },
    maybeSingle: async () => ({ data: existing }),
    insert(row: unknown) { inserted.push(row); return { select: () => ({ single: async () => ({ data: { id: 'comm-1' }, error: null }) }) }; },
    update() { return { eq: async () => ({ error: null }) }; },
    _inserted: inserted,
  };
  return client as never;
}

beforeEach(() => { sendEmailMock.mockReset(); sendEmailMock.mockResolvedValue({ success: true, providerMessageId: 'm1' }); });

describe('sendOrderEmailOnce', () => {
  it('skips when a prior non-failed comm exists', async () => {
    const supabase = makeSupabase({ id: 'prev', status: 'sent' });
    const r = await sendOrderEmailOnce({ supabase, orderId: 'o1', customerEmail: 'a@b.com', type: 'rx_received', rendered });
    expect(r).toEqual({ sent: false, reason: 'duplicate' });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('sends when no prior comm exists', async () => {
    const supabase = makeSupabase(null);
    const r = await sendOrderEmailOnce({ supabase, orderId: 'o1', customerEmail: 'a@b.com', type: 'rx_received', rendered });
    expect(r.sent).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith({ to: 'a@b.com', subject: 'S', html: '<p>h</p>', text: 't' });
  });

  it('never throws when the send fails', async () => {
    sendEmailMock.mockResolvedValue({ success: false, error: 'boom' });
    const supabase = makeSupabase(null);
    const r = await sendOrderEmailOnce({ supabase, orderId: 'o1', customerEmail: 'a@b.com', type: 'rx_received', rendered });
    expect(r).toEqual({ sent: false, reason: 'send_failed' });
  });
});
