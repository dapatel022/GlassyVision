-- Keystone 1: let a redemption synthesize an internal order with no Shopify ids.
alter table orders alter column shopify_order_id drop not null;
drop index if exists idx_orders_shopify_id;
-- (the column-level UNIQUE came from the table def; replace with a partial unique)
alter table orders drop constraint if exists orders_shopify_order_id_key;
create unique index orders_shopify_order_id_key on orders(shopify_order_id) where shopify_order_id is not null;
create index idx_orders_shopify_id on orders(shopify_order_id);
create type order_source as enum ('shopify', 'subscription');
alter table orders add column order_source order_source not null default 'shopify';

alter table order_line_items alter column shopify_line_item_id drop not null;

-- Per-item subscription coverage config.
alter table product_metadata add column subscription_tier text not null default 'included'
  check (subscription_tier in ('included', 'premium', 'excluded'));
alter table product_metadata add column subscription_surcharge_variant_id bigint;

-- System (customer-driven) inventory reservations have no staff user.
-- (The 'subscription_reserved'/'subscription_release' enum values are added in 00028.)
alter table inventory_adjustments alter column user_id drop not null;

-- Plans (seeded; admin builder UI is deferred).
create table subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pairs_count int not null default 3,
  term_months int not null default 12,
  billing_mode text not null default 'prepaid' check (billing_mode in ('prepaid', 'recurring')),
  redemption_policy jsonb not null default '{"mode":"all_immediate"}'::jsonb,
  end_of_term_policy jsonb not null default '{"mode":"expire","reminder_days":[60,30,7],"grace_days":14}'::jsonb,
  shopify_product_id bigint,
  shopify_variant_id bigint,
  status text not null default 'active' check (status in ('active','draft','archived')),
  created_at timestamptz not null default now()
);

create type membership_status as enum ('active','grace','expired','cancelled','refunded','frozen');
create table subscription_memberships (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references subscription_plans(id),
  customer_id uuid references customers(id),
  shopify_order_id bigint unique not null,
  status membership_status not null default 'active',
  term_start timestamptz not null default now(),
  term_end timestamptz not null,
  pairs_total int not null,
  redemption_policy jsonb not null,
  end_of_term_policy jsonb not null,
  next_renewal_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index idx_one_active_membership_per_customer
  on subscription_memberships(customer_id)
  where status in ('active','grace');

create type redemption_status as enum (
  'available','locked','pending_payment','awaiting_rx','in_review','in_production','shipped','delivered','cancelled','expired','rx_rejected'
);
create table subscription_redemptions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references subscription_memberships(id),
  slot_index int not null,
  status redemption_status not null default 'available',
  unlocks_at timestamptz not null default now(),
  frame_variant_id bigint,
  is_premium boolean not null default false,
  lens_config jsonb not null default '{}'::jsonb,
  ship_to jsonb,
  expected_surcharge numeric(10,2) not null default 0,
  add_on_shopify_order_id bigint,
  internal_order_id uuid references orders(id),
  internal_line_item_id uuid references order_line_items(id),
  rx_file_id uuid references rx_files(id),
  rx_review_id uuid references rx_reviews(id),
  work_order_id uuid references work_orders(id),
  retention_anchor date,
  pending_payment_expires_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (membership_id, slot_index)
);
create index idx_redemptions_membership on subscription_redemptions(membership_id);
create index idx_redemptions_pending on subscription_redemptions(pending_payment_expires_at) where status = 'pending_payment';

create table subscription_addon_options (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  shopify_variant_id bigint,
  price numeric(10,2) not null default 0,
  lens_effect jsonb not null default '{}'::jsonb,
  active boolean not null default true
);

-- RLS: customers read only their own membership + redemptions.
alter table subscription_memberships enable row level security;
alter table subscription_redemptions enable row level security;
create policy "Customer reads own memberships" on subscription_memberships
  for select using (customer_id = public.current_customer_id());
create policy "Customer reads own redemptions" on subscription_redemptions
  for select using (membership_id in (
    select id from subscription_memberships where customer_id = public.current_customer_id()
  ));

-- Seed the single phase-1 plan. shopify_product_id is set post-deploy from
-- SUBSCRIPTION_MEMBERSHIP_PRODUCT_ID once the Shopify product exists.
insert into subscription_plans (name, pairs_count, term_months, redemption_policy, end_of_term_policy, status)
values ('GlassyVision Annual — 3 Pairs', 3, 12,
        '{"mode":"all_immediate"}'::jsonb,
        '{"mode":"expire","reminder_days":[60,30,7],"grace_days":14}'::jsonb,
        'active');

-- Seed starter lens add-on options (variant ids set post-deploy).
insert into subscription_addon_options (key, label, price, lens_effect) values
  ('progressive', 'Progressive lenses', 0, '{"lens_type":"progressive"}'::jsonb),
  ('blue_light', 'Blue-light filter', 0, '{"coating":"blue_light"}'::jsonb),
  ('anti_glare', 'Anti-glare coating', 0, '{"coating":"anti_glare"}'::jsonb),
  ('high_index', 'High-index (thin) lenses', 0, '{"lens_material":"high_index_1_67"}'::jsonb),
  ('photochromic', 'Photochromic / polarized', 0, '{"coating":"photochromic"}'::jsonb);
