import { createServerClient } from '@/lib/supabase/server';

export type UserRole = 'pending' | 'founder' | 'reviewer' | 'lab_admin' | 'lab_operator' | 'lab_qc' | 'lab_shipping';

// 'pending' is the zero-access default for freshly-provisioned accounts; it is
// intentionally absent from both ADMIN_ROLES and LAB_ROLES.

const ADMIN_ROLES: UserRole[] = ['founder', 'reviewer'];
const LAB_ROLES: UserRole[] = ['founder', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping'];

export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function isLabRole(role: UserRole): boolean {
  return LAB_ROLES.includes(role);
}

export async function getCurrentUser() {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    email: user.email!,
    role: profile.role as UserRole,
    fullName: profile.full_name,
  };
}
