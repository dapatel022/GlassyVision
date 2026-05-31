// NOT a Server Action by design: a public, unauthenticated resend action is an
// email-bombing + enumeration vector. This is a server-only helper. The future
// "email me my claim link" UI must call it from a route handler that enforces
// CAPTCHA + per-IP/per-email rate limiting before invoking it. It is not yet
// wired to any UI.
import { createAdminClient } from '@/lib/supabase/admin';
import { buildClaimUrl } from '@/lib/auth/claim-token';
import { renderClaimEmail, renderClaimEmailText } from '@/lib/email/claim-template';
import { sendEmail } from '@/lib/email/resend';

/**
 * Re-send a claim link to a customer email. Always returns the same generic
 * result regardless of whether a match exists — never reveal account existence.
 */
export async function resendClaimLink(email: string): Promise<{ success: boolean }> {
  const admin = createAdminClient();
  const { data: customer } = await admin
    .from('customers')
    .select('id, email, auth_user_id')
    .eq('email', email)
    .maybeSingle();

  if (customer && !customer.auth_user_id) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://glassyvision.com';
    const claimUrl = buildClaimUrl(customer.id, baseUrl);
    await sendEmail({
      to: customer.email,
      subject: 'Create your GlassyVision account',
      html: renderClaimEmail(claimUrl),
      text: renderClaimEmailText(claimUrl),
    });
  }

  return { success: true };
}
