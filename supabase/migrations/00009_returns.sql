create type return_request_type as enum ('return', 'replacement', 'remake');
create type return_reason as enum (
  'damaged', 'defective', 'wrong_size', 'wrong_rx_typed',
  'wrong_rx_our_fault', 'change_of_mind', 'other'
);
create type return_resolution as enum ('refund', 'replacement', 'store_credit');
create type return_admin_decision as enum (
  'pending', 'approved_refund', 'approved_replacement',
  'approved_credit', 'approved_remake', 'rejected'
);
create type return_status as enum ('pending', 'in_progress', 'completed', 'rejected');

create table returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  line_item_id uuid references order_line_items(id),
  customer_email text not null,
  rma_number text unique not null,
  request_type return_request_type not null,
  reason return_reason not null,
  reason_detail text,
  photo_urls jsonb default '[]'::jsonb,
  preferred_resolution return_resolution,
  admin_decision return_admin_decision not null default 'pending',
  admin_notes text,
  shopify_refund_id bigint,
  store_credit_amount numeric(10,2),
  replacement_work_order_id uuid references work_orders(id),
  return_shipment_id uuid,
  status return_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index idx_returns_order on returns(order_id);
create index idx_returns_status on returns(status) where status != 'completed';
