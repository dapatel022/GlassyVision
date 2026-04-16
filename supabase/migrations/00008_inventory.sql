create table inventory_pool (
  id uuid primary key default gen_random_uuid(),
  shopify_product_id bigint not null,
  shopify_variant_id bigint unique not null,
  sku text not null,
  frame_shape text,
  color text,
  size text,
  pool_quantity int not null default 0 check (pool_quantity >= 0),
  threshold_alert int not null default 3,
  last_updated_by uuid references profiles(id),
  last_updated_at timestamptz not null default now()
);

create index idx_inventory_sku on inventory_pool(sku);

create type adjustment_reason as enum (
  'initial_stock', 'restock', 'order_fulfilled', 'walk_in_depletion',
  'manual_correction', 'damaged', 'return_restock'
);

create table inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  inventory_pool_id uuid not null references inventory_pool(id),
  delta int not null,
  reason adjustment_reason not null,
  reference_order_id uuid references orders(id),
  user_id uuid not null references profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_adjustments_pool on inventory_adjustments(inventory_pool_id);
