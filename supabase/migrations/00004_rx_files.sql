create type pd_type as enum ('mono', 'binocular');

create table rx_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  line_item_id uuid references order_line_items(id),
  customer_email text not null,
  storage_path text not null,
  original_filename text not null,
  file_size bigint not null,
  mime_type text not null,
  typed_od_sphere text,
  typed_od_cylinder text,
  typed_od_axis text,
  typed_od_add text,
  typed_os_sphere text,
  typed_os_cylinder text,
  typed_os_axis text,
  typed_os_add text,
  typed_pd text,
  typed_pd_type pd_type,
  rx_expiration_date date,
  certification_checked boolean not null default false,
  auto_check_results jsonb,
  checksum_sha256 text,
  scan_quality_score real,
  uploaded_at timestamptz not null default now(),
  uploaded_by_ip text,
  uploaded_by_user_agent text,
  deleted_at timestamptz
);

create index idx_rx_files_order on rx_files(order_id);
create index idx_rx_files_pending on rx_files(uploaded_at) where deleted_at is null;
