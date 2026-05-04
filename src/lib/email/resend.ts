import { Resend } from 'resend';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendEmailResult =
  | { success: true; providerMessageId: string | null }
  | { success: false; error: string };

let cachedClient: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!cachedClient) cachedClient = new Resend(key);
  return cachedClient;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const client = getClient();
  if (!client) {
    if (isProduction()) {
      // Missing RESEND_API_KEY in production is a config-incident-grade
      // failure. Surface it loudly via console.error so Vercel function
      // logs make it visible; the cron caller will record a status='failed'
      // comms row and bubble up to a 500 response.
      console.error('[email] RESEND_API_KEY not set in production — refusing to send');
      return { success: false, error: 'RESEND_API_KEY not set (production)' };
    }
    // Dev / test: log the subject only (never the recipient — PII).
    console.log('[email:stub]', { subject: input.subject });
    return { success: false, error: 'RESEND_API_KEY not set (dev stub)' };
  }

  const from = process.env.RESEND_FROM_EMAIL ?? 'hello@glassyvision.com';

  try {
    const { data, error } = await client.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, providerMessageId: data?.id ?? null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}
