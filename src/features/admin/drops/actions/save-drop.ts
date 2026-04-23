'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/types';

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
  return { success: true, id: data.id };
}

export async function updateDrop(id: string, input: DropInput): Promise<{ success: boolean; error?: string }> {
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
  return { success: true };
}
