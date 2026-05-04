import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: class FakeResend {
    emails = { send: sendMock };
  },
}));

const baseInput = {
  to: 'c@x.com',
  subject: 'Test',
  html: '<p>hi</p>',
  text: 'hi',
};

describe('sendEmail', () => {
  beforeEach(() => {
    sendMock.mockReset();
    vi.stubEnv('RESEND_API_KEY', '');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns failure with dev-stub error when RESEND_API_KEY is missing in test env', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { sendEmail } = await import('@/lib/email/resend');
    const result = await sendEmail(baseInput);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('dev stub');
  });

  it('logs subject only (NEVER the recipient email) in dev stub mode', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const logSpy = vi.spyOn(console, 'log');
    const { sendEmail } = await import('@/lib/email/resend');
    await sendEmail(baseInput);

    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logged).toContain('Test');
    expect(logged).not.toContain('c@x.com'); // PII must not be logged
  });

  it('returns failure with production-grade error when RESEND_API_KEY is missing in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const errorSpy = vi.spyOn(console, 'error');
    const { sendEmail } = await import('@/lib/email/resend');

    const result = await sendEmail(baseInput);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('production');
    // And surfaces loudly via console.error so Vercel logs catch it
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns success with provider message id when Resend SDK succeeds', async () => {
    vi.stubEnv('RESEND_API_KEY', 'fake-key');
    sendMock.mockResolvedValueOnce({ data: { id: 'resend-msg-1' }, error: null });
    const { sendEmail } = await import('@/lib/email/resend');

    const result = await sendEmail(baseInput);
    expect(result.success).toBe(true);
    expect((result as { providerMessageId: string }).providerMessageId).toBe('resend-msg-1');
  });

  it('returns failure when Resend SDK returns a structured error', async () => {
    vi.stubEnv('RESEND_API_KEY', 'fake-key');
    sendMock.mockResolvedValueOnce({ data: null, error: { message: 'Domain not verified' } });
    const { sendEmail } = await import('@/lib/email/resend');

    const result = await sendEmail(baseInput);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe('Domain not verified');
  });

  it('returns failure when Resend SDK throws', async () => {
    vi.stubEnv('RESEND_API_KEY', 'fake-key');
    sendMock.mockRejectedValueOnce(new Error('connection refused'));
    const { sendEmail } = await import('@/lib/email/resend');

    const result = await sendEmail(baseInput);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe('connection refused');
  });
});
