// NOT a Server Action: a server-only helper invoked from the magic-link auth
// callback AFTER Supabase has verified the user controls the email. Email
// possession is the authorization (no token in any URL), so we bind every
// still-unclaimed customer row with that email to the authenticated user.
//
// Delegates to the `claim_customers_by_verified_email` security-definer RPC,
// which consolidates duplicate guest rows onto the oldest before claiming —
// preventing the unique-index violation on auth_user_id that the old inline
// multi-row UPDATE produced when two guest rows shared the same email.
import { createAdminClient } from '@/lib/supabase/admin';

export async function linkCustomerByVerifiedEmail(
  authUserId: string,
  email: string,
): Promise<{ linked: number }> {
  if (!authUserId || !email) return { linked: 0 };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('claim_customers_by_verified_email', {
    p_auth_user_id: authUserId,
    p_email: email,
  });
  if (error) {
    console.error('[link-customer] claim RPC failed', { error });
    return { linked: 0 };
  }
  return { linked: (data as number) ?? 0 };
}
