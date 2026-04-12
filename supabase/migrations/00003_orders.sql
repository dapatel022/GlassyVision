create type order_financial_status as enum ('paid', 'refunded', 'partial_refund', 'pending');
create type order_fulfillment_status as enum ('unfulfilled', 'in_lab', 'shipped', 'delivered');
create type rx_status as enum ('none', 'awaiting_upload', 'uploaded_pending_review', 'approved', 'rejected');

create table orders (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id bigint unique not null,
  shopify_order_number text not null,
  customer_id uuid references customers(id),
  customer_email text not null,
  customer_name text not null default '',
  shipping_address jsonb,
  billing_country text check (billing_country in ('us', 'ca')),
  currency text not null default 'usd' check (currency in ('usd', 'cad')),
  subtotal numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  shipping_cost numeric(10,2) not null default 0,
  discount_code_used text,
  financial_status order_financial_status not null default 'paid',
  fulfillment_status order_fulfillment_status not null default 'unfulfilled',
  has_rx_items boolean not null default false,
  rx_status rx_status not null default 'none',
  drop_id uuid,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  first_order_ever boolean default false,
  notes_internal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_orders_shopify_id on orders(shopify_order_id);
create index idx_orders_customer_id on orders(customer_id);
create index idx_orders_rx_status on orders(rx_status) where has_rx_items = true;
create index idx_orders_fulfillment on orders(fulfillment_status);
create index idx_orders_created on orders(created_at desc);

create trigger orders_updated_at
  before update on orders
  for each row execute function update_updated_at();

create table order_line_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  shopify_line_item_id bigint not null,
  product_id bigint,
  variant_id bigint,
  product_handle text,
  product_title text not null,
  variant_title text,
  sku text,
  quantity int not null default 1,
  unit_price numeric(10,2) not null,
  line_total numeric(10,2) not null,
  is_rx_required boolean not null default false,
  frame_shape text,
  frame_color text,
  frame_size text
);

create index idx_line_items_order on order_line_items(order_id);
