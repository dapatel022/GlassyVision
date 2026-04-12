create type shipment_direction as enum ('outbound', 'return_inbound', 'replacement_outbound');
create type shipment_status as enum (
  'label_created', 'in_transit', 'delivered', 'exception', 'return_received'
);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  direction shipment_direction not null default 'outbound',
  carrier text,
  tracking_number text,
  tracking_url text,
  label_storage_path text,
  weight_g int,
  dimensions jsonb,
  cost_usd numeric(10,2),
  items jsonb not null default '[]'::jsonb,
  status shipment_status not null default 'label_created',
  shipped_at timestamptz,
  delivered_at timestamptz,
  commercial_invoice_path text,
  hs_code text default '9004.90',
  declared_value numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_shipments_order on shipments(order_id);
create index idx_shipments_tracking on shipments(tracking_number) where tracking_number is not null;

create trigger shipments_updated_at
  before update on shipments
  for each row execute function update_updated_at();

alter table lab_jobs add constraint fk_lab_jobs_shipment
  foreign key (shipment_id) references shipments(id);

alter table returns add constraint fk_returns_shipment
  foreign key (return_shipment_id) references shipments(id);
