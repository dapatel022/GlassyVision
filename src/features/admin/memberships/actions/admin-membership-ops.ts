'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isAdminRole } from '@/lib/auth/middleware';
import { sendEmail } from '@/lib/email/resend';
import { renderMembershipWelcome } from '@/lib/email/templates/membership-welcome';
import { renderSlotUnlocked } from '@/lib/email/templates/slot-unlocked';
import { renderExpiryWarning } from '@/lib/email/templates/expiry-warning';
import { renderRenewalOffer } from '@/lib/email/templates/renewal-offer';
import type { RenderedEmail } from '@/lib/email/templates/shared';
import type { Json } from '@/lib/supabase/types';

export interface MembershipOpInput {
  membershipId: string;
}

export interface MembershipOpResult {
  success: boolean;
  error?: string;
}

export type ResendableEmailType =
  | 'membership_welcome'
  | 'slot_unlocked'
  | 'expiry_warning'
  | 'renewal_offer';

export interface ResendEmailInput {
  membershipId: string;
  type: ResendableEmailType;
}

/** Slots not yet committed to fulfillment — the only ones a manual expire may touch. */
const UNCOMMITTED_STATUSES = ['available', 'locked', 'pending_payment'] as const;

interface MembershipRow {
  id: string;
  status: string;
  shopify_order_id: number;
  currency: string;
  pairs_total: number;
  customer_id: string | null;
  term_end?: string;
}

async function loadAdminAndMembership(membershipId: string): Promise<
  | { error: MembershipOpResult }
  | { user: { id: string; role: string }; supabase: ReturnType<typeof createAdminClient>; mem: MembershipRow }
> {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return { error: { success: false, error: 'Forbidden' } };
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('subscription_memberships')
    .select('id, status, shopify_order_id, currency, pairs_total, customer_id, term_end')
    .eq('id', membershipId)
    .maybeSingle();
  if (error || !data) {
    return { error: { success: false, error: 'Membership not found' } };
  }
  return { user, supabase, mem: data as MembershipRow };
}

async function writeAudit(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  action: string,
  membershipId: string,
  before: string,
  after: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    user_id: userId,
    action,
    entity_type: 'subscription_membership',
    entity_id: membershipId,
    before_data: { status: before } as unknown as Json,
    after_data: after as unknown as Json,
  });
  if (error) console.error(`[admin-membership-ops] audit_log failed (${action})`, { membershipId, error });
}

/**
 * Manual expire (spec §5.2). Expires uncommitted slots, sets the membership
 * `expired`. The DB guard trigger blocks the terminal transition while a slot is
 * committed — that error is surfaced. Idempotent: no-op when already terminal.
 */
export async function expireMembership(input: MembershipOpInput): Promise<MembershipOpResult> {
  const loaded = await loadAdminAndMembership(input.membershipId);
  if ('error' in loaded) return loaded.error;
  const { user, supabase, mem } = loaded;

  if (
    mem.status !== 'active' &&
    mem.status !== 'grace' &&
    mem.status !== 'frozen' &&
    mem.status !== 'disputed'
  ) {
    return { success: true }; // already terminal / not expirable
  }

  await supabase
    .from('subscription_redemptions')
    .update({ status: 'expired' })
    .eq('membership_id', mem.id)
    .in('status', [...UNCOMMITTED_STATUSES]);

  const { error: updErr } = await supabase
    .from('subscription_memberships')
    .update({ status: 'expired' })
    .eq('id', mem.id);

  if (updErr) {
    return { success: false, error: `Cannot expire while a slot is committed: ${updErr.message}` };
  }

  await writeAudit(supabase, user.id, 'membership_expired_manual', mem.id, mem.status, { status: 'expired' });
  return { success: true };
}

/** Freeze a membership (dispute / manual hold). Blocks new redemptions. */
export async function freezeMembership(input: MembershipOpInput): Promise<MembershipOpResult> {
  const loaded = await loadAdminAndMembership(input.membershipId);
  if ('error' in loaded) return loaded.error;
  const { user, supabase, mem } = loaded;

  if (mem.status !== 'active' && mem.status !== 'grace') {
    return { success: false, error: `Cannot freeze a membership in status ${mem.status}` };
  }

  const { error: updErr } = await supabase
    .from('subscription_memberships')
    .update({ status: 'frozen' })
    .eq('id', mem.id);
  if (updErr) return { success: false, error: updErr.message };

  await writeAudit(supabase, user.id, 'membership_frozen', mem.id, mem.status, { status: 'frozen' });
  return { success: true };
}

/** Unfreeze a frozen membership back to active. */
export async function unfreezeMembership(input: MembershipOpInput): Promise<MembershipOpResult> {
  const loaded = await loadAdminAndMembership(input.membershipId);
  if ('error' in loaded) return loaded.error;
  const { user, supabase, mem } = loaded;

  if (mem.status !== 'frozen') {
    return { success: false, error: `Only a frozen membership can be unfrozen (current: ${mem.status})` };
  }

  const { error: updErr } = await supabase
    .from('subscription_memberships')
    .update({ status: 'active' })
    .eq('id', mem.id);
  if (updErr) return { success: false, error: updErr.message };

  await writeAudit(supabase, user.id, 'membership_unfrozen', mem.id, mem.status, { status: 'active' });
  return { success: true };
}

/**
 * Resolve a dispute in the merchant's favour (chargeback won) by returning a
 * `disputed` membership to `active` so its prepaid slots become redeemable
 * again. Without this, `disputed` is a dead-end: no action can move a membership
 * out of it and the customer's paid-for slots are stranded forever. A LOST
 * chargeback is instead settled via `cancelMembership`/`expireMembership`
 * (both now accept `disputed`).
 */
export async function resolveDispute(input: MembershipOpInput): Promise<MembershipOpResult> {
  const loaded = await loadAdminAndMembership(input.membershipId);
  if ('error' in loaded) return loaded.error;
  const { user, supabase, mem } = loaded;

  if (mem.status !== 'disputed') {
    return { success: false, error: `Only a disputed membership can be resolved (current: ${mem.status})` };
  }

  const { error: updErr } = await supabase
    .from('subscription_memberships')
    .update({ status: 'active' })
    .eq('id', mem.id);
  if (updErr) return { success: false, error: updErr.message };

  await writeAudit(supabase, user.id, 'membership_dispute_resolved', mem.id, mem.status, { status: 'active' });
  return { success: true };
}

/**
 * Resend a lifecycle email to the membership's customer. Unlike the automated
 * sends this deliberately bypasses the `communications` idempotency dedupe (it
 * is an intentional admin re-send), but still records a `communications` row and
 * an `audit_log` entry for traceability.
 */
export async function resendMembershipEmail(input: ResendEmailInput): Promise<MembershipOpResult> {
  const loaded = await loadAdminAndMembership(input.membershipId);
  if ('error' in loaded) return loaded.error;
  const { user, supabase, mem } = loaded;

  // Resolve recipient.
  let email: string | null = null;
  let firstName = 'there';
  if (mem.customer_id) {
    const { data: cust } = await supabase
      .from('customers')
      .select('email, first_name')
      .eq('id', mem.customer_id)
      .maybeSingle();
    const c = cust as { email?: string | null; first_name?: string | null } | null;
    if (c?.email) email = c.email;
    if (c?.first_name && c.first_name.trim()) firstName = c.first_name.trim();
  }
  if (!email) return { success: false, error: 'Customer has no email on file' };

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://glassyvision.com';
  const manageUrl = `${baseUrl}/account/subscription`;

  let rendered: RenderedEmail;
  switch (input.type) {
    case 'membership_welcome':
      rendered = renderMembershipWelcome({ memberName: firstName, pairsTotal: mem.pairs_total, manageUrl });
      break;
    case 'slot_unlocked':
      rendered = renderSlotUnlocked({ memberName: firstName, redeemUrl: manageUrl });
      break;
    case 'expiry_warning': {
      const daysLeft = mem.term_end
        ? Math.max(0, Math.ceil((new Date(mem.term_end).getTime() - Date.now()) / 86_400_000))
        : 0;
      rendered = renderExpiryWarning({ daysLeft, manageUrl });
      break;
    }
    case 'renewal_offer':
      rendered = renderRenewalOffer({ renewUrl: manageUrl });
      break;
    default:
      return { success: false, error: 'Unknown email type' };
  }

  const metadata = { membership_id: mem.id, resent_by: user.id };
  const { data: claimed } = await supabase
    .from('communications')
    .insert({
      order_id: null,
      customer_email: email,
      type: input.type,
      direction: 'outbound',
      channel: 'email',
      provider: 'resend',
      subject: rendered.subject,
      status: 'queued',
      metadata,
    })
    .select('id')
    .single();

  const result = await sendEmail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  const commId = (claimed as { id: string } | null)?.id;
  if (commId) {
    if (result.success) {
      await supabase
        .from('communications')
        .update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: result.providerMessageId })
        .eq('id', commId);
    } else {
      await supabase
        .from('communications')
        .update({ status: 'failed', metadata: { ...metadata, failed_error: result.error } })
        .eq('id', commId);
    }
  }

  if (!result.success) {
    return { success: false, error: `Email send failed: ${result.error ?? 'unknown'}` };
  }

  await writeAudit(supabase, user.id, 'membership_email_resent', mem.id, mem.status, {
    email_type: input.type,
    to: email,
  });
  return { success: true };
}
