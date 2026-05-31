// NOT a Server Action: called only from the server-component claim page, so it
// stays off the client RPC surface. It is gated by a valid HMAC token + an
// authenticated session + an email match.
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyClaimToken } from '@/lib/auth/claim-token';

export type ClaimResult =
  | { status: 'claimed' }
  | { status: 'needsAuth' }
  | { status: 'error'; error: string };

export async function claimAccount(customerId: string, token: string, exp: number): Promise<ClaimResult> {
  if (!verifyClaimToken(customerId, token, exp)) {
    return { status: 'error', error: 'This claim link is invalid or has expired.' };
  }

  const server = await createServerClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return { status: 'needsAuth' };

  const admin = createAdminClient();
  const { data: customer } = await admin
    .from('customers')
    .select('id, email, auth_user_id')
    .eq('id', customerId)
    .maybeSingle();

  if (!customer) return { status: 'error', error: 'Account not found.' };

  if (customer.auth_user_id) {
    return customer.auth_user_id === user.id
      ? { status: 'claimed' }
      : { status: 'error', error: 'This purchase is already linked to another account.' };
  }

  // Phase 1 has no gifting, so the claimer is always the buyer: require the
  // signed-in email to match the checkout email. This closes the account-takeover
  // vector if a claim link leaks — the link alone is not enough. A future gift
  // flow would route cross-email claims through an explicit re-verification step.
  const emailMatches = (user.email ?? '').toLowerCase() === (customer.email ?? '').toLowerCase();
  if (!emailMatches) {
    return { status: 'error', error: 'Please sign in with the email address used at checkout to claim this purchase.' };
  }

  // Atomic bind: succeeds only if the row is still unclaimed, closing the
  // check-then-update race. Zero rows back means another request won first.
  const { data: updated, error } = await admin
    .from('customers')
    .update({ auth_user_id: user.id })
    .eq('id', customerId)
    .is('auth_user_id', null)
    .select('id');

  if (error || !updated || updated.length === 0) {
    return { status: 'error', error: 'This purchase is already linked to another account.' };
  }
  return { status: 'claimed' };
}
