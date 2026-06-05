-- 00031_subscription_lifecycle.sql
-- Make the subscription engine money-safe and lifecycle-complete:
-- new comm types, dispute membership state, membership lifecycle columns,
-- a customer saved-addresses table, and a guard trigger keeping a membership
-- out of a terminal money state while any slot is still committed.

-- 1. New communication types for the membership lifecycle
alter type comm_type add value if not exists 'membership_welcome';
alter type comm_type add value if not exists 'slot_unlocked';
alter type comm_type add value if not exists 'pair_shipped';
alter type comm_type add value if not exists 'expiry_warning';
alter type comm_type add value if not exists 'renewal_offer';

-- 2. Dispute state for memberships
alter type membership_status add value if not exists 'disputed';

-- 3. Lifecycle columns
alter table subscription_memberships
  add column if not exists grace_start timestamptz,
  add column if not exists renewal_offer_sent_at timestamptz,
  add column if not exists rollover_count int not null default 0,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;

-- 4. Saved addresses
create table if not exists customer_saved_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  label text,
  recipient_name text not null,
  address jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_saved_addr_customer on customer_saved_addresses(customer_id);
create unique index if not exists idx_saved_addr_one_default
  on customer_saved_addresses(customer_id) where is_default;

-- RLS: customers read/write only their own saved addresses (mirror 00027/00029).
alter table customer_saved_addresses enable row level security;
drop policy if exists "addr_select_own" on customer_saved_addresses;
create policy "addr_select_own" on customer_saved_addresses for select
  using (customer_id = public.current_customer_id());
drop policy if exists "addr_insert_own" on customer_saved_addresses;
create policy "addr_insert_own" on customer_saved_addresses for insert
  with check (customer_id = public.current_customer_id());
drop policy if exists "addr_update_own" on customer_saved_addresses;
create policy "addr_update_own" on customer_saved_addresses for update
  using (customer_id = public.current_customer_id());
drop policy if exists "addr_delete_own" on customer_saved_addresses;
create policy "addr_delete_own" on customer_saved_addresses for delete
  using (customer_id = public.current_customer_id());

-- 5. Guard: a membership may not reach a terminal money state while any slot is committed.
-- `pending_payment` is deliberately NOT in the committed/blocking set: it is a
-- pre-fulfillment, money-not-yet-captured state and every app caller treats it as
-- uncommitted (expires it, releasing its inventory reservation). Committed =
-- {awaiting_rx, in_review, in_production, shipped} — the same set the cron's
-- COMMITTED_STATUSES uses; nothing past `shipped` (delivered/cancelled/expired/
-- rx_rejected) blocks a terminal membership transition.
create or replace function guard_membership_terminal()
returns trigger language plpgsql as $$
begin
  if new.status in ('expired','refunded','cancelled') then
    if exists (
      select 1 from subscription_redemptions r
      where r.membership_id = new.id
        and r.status in ('awaiting_rx','in_review','in_production','shipped')
    ) then
      raise exception 'cannot set membership % to % while a slot is committed', new.id, new.status;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_membership_terminal on subscription_memberships;
create trigger trg_guard_membership_terminal
  before update of status on subscription_memberships
  for each row execute function guard_membership_terminal();
