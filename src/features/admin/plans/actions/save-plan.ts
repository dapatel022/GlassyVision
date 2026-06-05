'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isAdminRole } from '@/lib/auth/middleware';
import type { Json } from '@/lib/supabase/types';

export type EndOfTermMode = 'expire' | 'refund' | 'rollover';
export type PlanStatus = 'draft' | 'active' | 'archived';

export interface SavePlanInput {
  /** Present on edit; absent on create. */
  id?: string;
  name: string;
  pairsCount: number;
  termMonths: number;
  /** `redemption_policy.mode` — phase-1 only supports `all_immediate`. */
  redemptionMode: string;
  endOfTermMode: EndOfTermMode;
  reminderDays: number[];
  graceDays: number;
  status: PlanStatus;
  shopifyProductId: number | null;
  shopifyVariantId: number | null;
}

export interface SavePlanResult {
  success: boolean;
  id?: string;
  error?: string;
}

const END_OF_TERM_MODES: EndOfTermMode[] = ['expire', 'refund', 'rollover'];
const PLAN_STATUSES: PlanStatus[] = ['draft', 'active', 'archived'];

/** Statuses that count as a "live" membership — terms are frozen, so the plan
 *  template's pairs_count / term_months must not drift underneath them. */
const LIVE_MEMBERSHIP_STATUSES = ['active', 'grace', 'disputed', 'frozen'] as const;

/**
 * Admin Server Action: create or update a `subscription_plans` row (spec §5.1).
 * Mirrors `reviewRx`'s auth guard + audit pattern.
 *
 * Plans are mutable templates for **new** memberships only — existing
 * memberships keep their frozen snapshot. To stop silent template drift, when a
 * plan has live memberships we block edits to `pairs_count` / `term_months`
 * (the frozen terms) while still allowing status / markets / Shopify-id edits.
 */
export async function savePlan(input: SavePlanInput): Promise<SavePlanResult> {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return { success: false, error: 'Forbidden' };
  }

  // Validation.
  if (!input.name || !input.name.trim()) {
    return { success: false, error: 'Plan name is required' };
  }
  if (!Number.isFinite(input.pairsCount) || input.pairsCount <= 0) {
    return { success: false, error: 'pairs_count must be greater than 0' };
  }
  if (!Number.isFinite(input.termMonths) || input.termMonths <= 0) {
    return { success: false, error: 'term_months must be greater than 0' };
  }
  if (!END_OF_TERM_MODES.includes(input.endOfTermMode)) {
    return { success: false, error: 'end_of_term mode must be expire, refund, or rollover' };
  }
  if (!PLAN_STATUSES.includes(input.status)) {
    return { success: false, error: 'status must be draft, active, or archived' };
  }

  const supabase = createAdminClient();

  const redemptionPolicy = { mode: input.redemptionMode } as unknown as Json;
  const endOfTermPolicy = {
    mode: input.endOfTermMode,
    reminder_days: input.reminderDays,
    grace_days: input.graceDays,
  } as unknown as Json;

  // ── Edit path ──────────────────────────────────────────────────────────────
  if (input.id) {
    const { data: existing, error: existErr } = await supabase
      .from('subscription_plans')
      .select('id, pairs_count, term_months')
      .eq('id', input.id)
      .maybeSingle();

    if (existErr || !existing) {
      return { success: false, error: 'Plan not found' };
    }
    const prev = existing as { id: string; pairs_count: number; term_months: number };

    const termsChanged =
      prev.pairs_count !== input.pairsCount || prev.term_months !== input.termMonths;

    if (termsChanged) {
      const { count } = await supabase
        .from('subscription_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('plan_id', input.id)
        .in('status', [...LIVE_MEMBERSHIP_STATUSES]);

      if ((count ?? 0) > 0) {
        return {
          success: false,
          error:
            'Cannot change pairs_count or term_months while this plan has live memberships (their terms are frozen). Archive this plan and create a new one instead.',
        };
      }
    }

    const { error: updErr } = await supabase
      .from('subscription_plans')
      .update({
        name: input.name.trim(),
        pairs_count: input.pairsCount,
        term_months: input.termMonths,
        redemption_policy: redemptionPolicy,
        end_of_term_policy: endOfTermPolicy,
        status: input.status,
        shopify_product_id: input.shopifyProductId,
        shopify_variant_id: input.shopifyVariantId,
      })
      .eq('id', input.id);

    if (updErr) return { success: false, error: updErr.message };

    await writeAudit(supabase, user.id, input.id, 'updated', input);
    return { success: true, id: input.id };
  }

  // ── Create path ────────────────────────────────────────────────────────────
  const { data: created, error: insErr } = await supabase
    .from('subscription_plans')
    .insert({
      name: input.name.trim(),
      pairs_count: input.pairsCount,
      term_months: input.termMonths,
      redemption_policy: redemptionPolicy,
      end_of_term_policy: endOfTermPolicy,
      status: input.status,
      shopify_product_id: input.shopifyProductId,
      shopify_variant_id: input.shopifyVariantId,
    })
    .select('id')
    .single();

  if (insErr || !created) {
    return { success: false, error: insErr?.message ?? 'Failed to create plan' };
  }

  await writeAudit(supabase, user.id, created.id, 'created', input);
  return { success: true, id: created.id };
}

async function writeAudit(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  planId: string,
  verb: 'created' | 'updated',
  input: SavePlanInput,
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    user_id: userId,
    action: 'plan_saved',
    entity_type: 'subscription_plan',
    entity_id: planId,
    after_data: {
      verb,
      name: input.name,
      pairs_count: input.pairsCount,
      term_months: input.termMonths,
      end_of_term_mode: input.endOfTermMode,
      status: input.status,
    } as unknown as Json,
  });
  if (error) {
    console.error('[save-plan] audit_log insert failed', { planId, error });
  }
}
