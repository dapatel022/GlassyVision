'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/types';

type UserRole = Database['public']['Enums']['user_role'];

export async function createInvitation(
  email: string,
  role: UserRole,
  invitedByUserId: string,
): Promise<{ success: boolean; inviteUrl?: string; error?: string }> {
  const cleaned = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    return { success: false, error: 'Invalid email' };
  }

  const supabase = createAdminClient();

  const { data: invitation, error } = await supabase
    .from('user_invitations')
    .insert({
      email: cleaned,
      role,
      invited_by: invitedByUserId,
    })
    .select('token')
    .single();

  if (error || !invitation) {
    return { success: false, error: 'Failed to create invitation' };
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  return {
    success: true,
    inviteUrl: `${baseUrl}/invite/${invitation.token}`,
  };
}
