'use server';

import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyClaimToken } from '@/lib/auth/claim-token';
import type { Json } from '@/lib/supabase/types';

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
    .select('id, email, auth_user_id, flags')
    .eq('id', customerId)
    .maybeSingle();

  if (!customer) return { status: 'error', error: 'Account not found.' };

  if (customer.auth_user_id) {
    return customer.auth_user_id === user.id
      ? { status: 'claimed' }
      : { status: 'error', error: 'This purchase is already linked to another account.' };
  }

  const flags = (customer.flags as Record<string, unknown>) ?? {};
  const mismatch = (user.email ?? '').toLowerCase() !== (customer.email ?? '').toLowerCase();
  const nextFlags = mismatch ? { ...flags, claim_email_mismatch: true } : flags;

  const { error } = await admin
    .from('customers')
    .update({ auth_user_id: user.id, flags: nextFlags as Json })
    .eq('id', customerId);

  if (error) return { status: 'error', error: 'Could not link your account. Please try again.' };
  return { status: 'claimed' };
}
