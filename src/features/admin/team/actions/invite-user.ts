'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/middleware';
import type { Database, Json } from '@/lib/supabase/types';

type UserRole = Database['public']['Enums']['user_role'];

const INVITABLE_ROLES: UserRole[] = [
  'founder', 'reviewer', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping',
];

/**
 * Create a staff invitation. Team/role management mints privileged accounts, so
 * it is restricted to the `founder` role — never derive the inviter from a
 * client-supplied parameter (that was the privilege-escalation hole: an
 * unauthenticated caller could mint a `founder` invite for itself).
 */
export async function createInvitation(
  email: string,
  role: UserRole,
): Promise<{ success: boolean; inviteUrl?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user || user.role !== 'founder') {
    return { success: false, error: 'Forbidden' };
  }

  const cleaned = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    return { success: false, error: 'Invalid email' };
  }
  if (!INVITABLE_ROLES.includes(role)) {
    return { success: false, error: 'Invalid role' };
  }

  const supabase = createAdminClient();

  const { data: invitation, error } = await supabase
    .from('user_invitations')
    .insert({
      email: cleaned,
      role,
      invited_by: user.id,
    })
    .select('token')
    .single();

  if (error || !invitation) {
    return { success: false, error: 'Failed to create invitation' };
  }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'invitation_created',
    entity_type: 'user_invitations',
    entity_id: invitation.token,
    after_data: { email: cleaned, role } as unknown as Json,
  });
  if (auditErr) {
    console.error('[invite-user] audit_log insert failed', { email: cleaned, error: auditErr });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  return {
    success: true,
    inviteUrl: `${baseUrl}/invite/${invitation.token}`,
  };
}
