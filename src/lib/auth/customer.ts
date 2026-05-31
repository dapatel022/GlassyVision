import { createServerClient } from '@/lib/supabase/server';

export interface CurrentCustomer {
  id: string;
  email: string;
  authUserId: string;
}

export async function getCurrentCustomer(): Promise<CurrentCustomer | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: customer } = await supabase
    .from('customers')
    .select('id, email')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!customer) return null;
  return { id: customer.id, email: customer.email, authUserId: user.id };
}
