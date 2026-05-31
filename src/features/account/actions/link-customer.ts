// NOT a Server Action: a server-only helper invoked from the magic-link auth
// callback AFTER Supabase has verified the user controls the email. Email
// possession is the authorization (no token in any URL), so we bind every
// still-unclaimed customer row with that email to the authenticated user.
import { createAdminClient } from '@/lib/supabase/admin';

export async function linkCustomerByVerifiedEmail(
  authUserId: string,
  email: string,
): Promise<{ linked: number }> {
  if (!authUserId || !email) return { linked: 0 };

  const admin = createAdminClient();
  // Atomic: only claims rows that are still unclaimed. Shopify and Supabase both
  // normalize emails to lowercase, so an exact match is correct and avoids the
  // wildcard pitfalls of a case-insensitive LIKE.
  const { data } = await admin
    .from('customers')
    .update({ auth_user_id: authUserId })
    .eq('email', email)
    .is('auth_user_id', null)
    .select('id');

  return { linked: data?.length ?? 0 };
}
