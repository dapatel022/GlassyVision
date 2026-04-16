create type vip_tier as enum ('none', 'returning', 'vip');

create table customers (
  id uuid primary key default gen_random_uuid(),
  shopify_customer_id bigint unique,
  email text not null,
  first_name text default '',
  last_name text default '',
  lifetime_value numeric(10,2) default 0,
  total_orders int default 0,
  first_order_at timestamptz,
  last_order_at timestamptz,
  vip_tier vip_tier not null default 'none',
  internal_notes text,
  flags jsonb default '{}'::jsonb,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_customers_shopify_id on customers(shopify_customer_id);
create index idx_customers_email on customers(email);

create trigger customers_updated_at
  before update on customers
  for each row execute function update_updated_at();
