create type notify_trigger as enum ('launch', 'back_in_stock', 'next_drop');

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  drop_id uuid references drops(id),
  shopify_product_id bigint,
  notify_when notify_trigger not null default 'launch',
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  check (drop_id is not null or shopify_product_id is not null)
);

create index idx_waitlist_drop on waitlist(drop_id) where notified_at is null;
create index idx_waitlist_product on waitlist(shopify_product_id) where notified_at is null;
