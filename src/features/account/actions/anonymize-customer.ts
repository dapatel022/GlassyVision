// NOT a Server Action by design: this is a privileged, server-only helper (PII
// scrub + auth-user deletion) invoked from the HMAC-verified Shopify
// `customers/redact` webhook and other trusted server code. Exposing it as a
// client-callable Server Action would be an unauthenticated IDOR — anyone could
// anonymize/delete any customer by id.
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GDPR/CCPA deletion vs FTC 3-year Rx retention: scrub customer PII and remove
 * the auth identity, but NEVER touch rx_files or dispensed-order compliance
 * records — those are retained in restricted storage until the window lapses.
 */
export async function anonymizeCustomer(customerId: string): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();

  const { data: customer } = await admin
    .from('customers')
    .select('id, auth_user_id')
    .eq('id', customerId)
    .maybeSingle();

  if (!customer) return { success: false, error: 'Customer not found' };

  const { error } = await admin
    .from('customers')
    .update({
      email: `redacted-${customerId}@deleted.invalid`,
      first_name: '',
      last_name: '',
      internal_notes: null,
      auth_user_id: null,
      deletion_requested_at: new Date().toISOString(),
    })
    .eq('id', customerId);

  if (error) return { success: false, error: 'Anonymization failed' };

  if (customer.auth_user_id) {
    await admin.auth.admin.deleteUser(customer.auth_user_id);
  }

  return { success: true };
}
