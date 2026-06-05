'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentCustomer } from '@/lib/auth/customer';
import { createServerClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';

// Saved-address CRUD for the customer account.
//
// SECURITY — every action requires an authenticated customer
// (`getCurrentCustomer`). Mutations run through the USER-SCOPED Supabase client
// (`createServerClient`), so Postgres RLS (`addr_*_own` policies, migration
// 00031) is the authorization boundary: a customer can only read/insert/update/
// delete rows whose `customer_id = current_customer_id()`. We never use the
// service-role admin client here — RLS must do the scoping, and a guessed
// `addressId` for someone else's row simply matches zero rows.
//
// The partial-unique index `idx_saved_addr_one_default` enforces at most one
// default per customer, so before setting a new default we clear the old one.

export interface AddressInput {
  recipientName: string;
  address: Record<string, unknown>;
  label?: string;
  isDefault?: boolean;
}

export interface AddressActionResult {
  ok?: boolean;
  id?: string;
  error?: string;
}

const ACCOUNT_ADDRESSES_PATH = '/account/addresses';

export async function addAddress(input: AddressInput): Promise<AddressActionResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { error: 'You must be signed in to manage addresses.' };

  if (!input.recipientName?.trim()) return { error: 'A recipient name is required.' };
  if (!input.address || typeof input.address !== 'object') return { error: 'A valid address is required.' };

  const supabase = await createServerClient();
  const isDefault = !!input.isDefault;

  // Clear any existing default first so the partial-unique index never trips.
  // RLS scopes the update to this customer's rows.
  if (isDefault) {
    const { error: clearError } = await supabase
      .from('customer_saved_addresses')
      .update({ is_default: false })
      .eq('customer_id', customer.id)
      .eq('is_default', true);
    if (clearError) return { error: 'Could not save this address. Please try again.' };
  }

  const { data, error } = await supabase
    .from('customer_saved_addresses')
    .insert({
      customer_id: customer.id,
      recipient_name: input.recipientName.trim(),
      label: input.label?.trim() || null,
      address: input.address as Json,
      is_default: isDefault,
    })
    .select('id');

  if (error || !data || data.length === 0) {
    return { error: 'Could not save this address. Please try again.' };
  }

  revalidatePath(ACCOUNT_ADDRESSES_PATH);
  return { ok: true, id: data[0].id };
}

export async function updateAddress(
  addressId: string,
  input: AddressInput,
): Promise<AddressActionResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { error: 'You must be signed in to manage addresses.' };

  if (!input.recipientName?.trim()) return { error: 'A recipient name is required.' };
  if (!input.address || typeof input.address !== 'object') return { error: 'A valid address is required.' };

  const supabase = await createServerClient();
  const isDefault = !!input.isDefault;

  if (isDefault) {
    const { error: clearError } = await supabase
      .from('customer_saved_addresses')
      .update({ is_default: false })
      .eq('customer_id', customer.id)
      .eq('is_default', true)
      .neq('id', addressId);
    if (clearError) return { error: 'Could not update this address. Please try again.' };
  }

  // RLS (addr_update_own) is the ownership check; `.eq('id', addressId)` simply
  // matches zero rows for a foreign address.
  const { error } = await supabase
    .from('customer_saved_addresses')
    .update({
      recipient_name: input.recipientName.trim(),
      label: input.label?.trim() || null,
      address: input.address as Json,
      is_default: isDefault,
    })
    .eq('id', addressId);

  if (error) return { error: 'Could not update this address. Please try again.' };

  revalidatePath(ACCOUNT_ADDRESSES_PATH);
  return { ok: true };
}

export async function deleteAddress(addressId: string): Promise<AddressActionResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { error: 'You must be signed in to manage addresses.' };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('customer_saved_addresses')
    .delete()
    .eq('id', addressId);

  if (error) return { error: 'Could not delete this address. Please try again.' };

  revalidatePath(ACCOUNT_ADDRESSES_PATH);
  return { ok: true };
}

export async function setDefaultAddress(addressId: string): Promise<AddressActionResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { error: 'You must be signed in to manage addresses.' };

  const supabase = await createServerClient();

  // Clear the current default, then set the chosen one. RLS scopes both writes.
  const { error: clearError } = await supabase
    .from('customer_saved_addresses')
    .update({ is_default: false })
    .eq('customer_id', customer.id)
    .eq('is_default', true)
    .neq('id', addressId);
  if (clearError) return { error: 'Could not update your default address.' };

  const { error } = await supabase
    .from('customer_saved_addresses')
    .update({ is_default: true })
    .eq('id', addressId);
  if (error) return { error: 'Could not update your default address.' };

  revalidatePath(ACCOUNT_ADDRESSES_PATH);
  return { ok: true };
}
