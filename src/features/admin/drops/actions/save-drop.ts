'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isAdminRole } from '@/lib/auth/middleware';
import type { Database, Json } from '@/lib/supabase/types';

type DropState = Database['public']['Enums']['drop_state'];

export interface DropInput {
  slug: string;
  name: string;
  number: number;
  heroHeadline: string | null;
  heroCopy: string | null;
  startsAt: string;
  endsAt: string;
  state: DropState;
  totalCapacity: number | null;
}

export async function createDrop(input: DropInput): Promise<{ success: boolean; id?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return { success: false, error: 'Forbidden' };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('drops')
    .insert({
      slug: input.slug,
      name: input.name,
      number: input.number,
      hero_headline: input.heroHeadline,
      hero_copy: input.heroCopy,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      state: input.state,
      total_capacity: input.totalCapacity,
    })
    .select('id')
    .single();
  if (error || !data) return { success: false, error: error?.message ?? 'Failed to create' };

  await writeDropAudit(supabase, user.id, 'drop_created', data.id, input);
  return { success: true, id: data.id };
}

export async function updateDrop(id: string, input: DropInput): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return { success: false, error: 'Forbidden' };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('drops')
    .update({
      slug: input.slug,
      name: input.name,
      number: input.number,
      hero_headline: input.heroHeadline,
      hero_copy: input.heroCopy,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      state: input.state,
      total_capacity: input.totalCapacity,
    })
    .eq('id', id);
  if (error) return { success: false, error: error.message };

  await writeDropAudit(supabase, user.id, 'drop_updated', id, input);
  return { success: true };
}

async function writeDropAudit(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  action: 'drop_created' | 'drop_updated',
  dropId: string,
  input: DropInput,
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    user_id: userId,
    action,
    entity_type: 'drops',
    entity_id: dropId,
    after_data: { slug: input.slug, state: input.state, number: input.number } as unknown as Json,
  });
  if (error) {
    console.error('[save-drop] audit_log insert failed', { dropId, action, error });
  }
}
