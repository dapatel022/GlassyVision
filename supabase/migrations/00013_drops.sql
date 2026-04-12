create type drop_state as enum ('draft', 'scheduled', 'live', 'sold_out', 'closed');

create table drops (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  number int unique not null,
  hero_headline text,
  hero_copy text,
  hero_image_url text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  state drop_state not null default 'draft',
  total_capacity int,
  sold_count int not null default 0,
  revenue numeric(10,2) not null default 0,
  marketing_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger drops_updated_at
  before update on drops
  for each row execute function update_updated_at();

alter table orders add constraint fk_orders_drop
  foreign key (drop_id) references drops(id);

create type drop_feature_tier as enum ('hero', 'supporting');

create table drop_products (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references drops(id) on delete cascade,
  shopify_product_id bigint not null,
  display_order int not null default 0,
  feature_tier drop_feature_tier not null default 'supporting',
  unique (drop_id, shopify_product_id)
);
