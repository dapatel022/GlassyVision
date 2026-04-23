'use server';

import { createAdminClient } from '@/lib/supabase/admin';

export interface AcceptInviteInput {
  token: string;
  password: string;
  fullName: string;
}

export async function acceptInvite(input: AcceptInviteInput): Promise<{ success: boolean; error?: string }> {
  if (input.password.length < 8) return { success: false, error: 'Password must be at least 8 characters' };

  const supabase = createAdminClient();

  const { data: invitation } = await supabase
    .from('user_invitations')
    .select('id, email, role, expires_at, accepted_at')
    .eq('token', input.token)
    .maybeSingle();

  if (!invitation) return { success: false, error: 'Invite not found' };
  if (invitation.accepted_at) return { success: false, error: 'Invite already used' };
  if (new Date(invitation.expires_at) < new Date()) return { success: false, error: 'Invite expired' };

  const { data: created, error: authError } = await supabase.auth.admin.createUser({
    email: invitation.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });

  if (authError || !created.user) {
    if (authError?.message?.includes('already registered')) {
      return { success: false, error: 'An account with that email already exists' };
    }
    return { success: false, error: authError?.message ?? 'Failed to create account' };
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: created.user.id,
      email: invitation.email,
      full_name: input.fullName,
      role: invitation.role,
    });

  if (profileError) {
    await supabase.auth.admin.deleteUser(created.user.id).catch(() => null);
    return { success: false, error: 'Failed to provision profile' };
  }

  await supabase
    .from('user_invitations')
    .update({ accepted_at: new Date().toISOString(), accepted_profile_id: created.user.id })
    .eq('id', invitation.id);

  return { success: true };
}
