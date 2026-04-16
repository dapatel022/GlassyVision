create type kanban_column as enum (
  'inbox', 'ready_to_cut', 'on_edger', 'on_bench', 'qc', 'ship'
);

create table lab_jobs (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid unique not null references work_orders(id),
  "column" kanban_column not null default 'inbox',
  priority int not null default 5 check (priority between 0 and 10),
  assigned_to uuid references profiles(id),
  physical_tray_qr text,
  started_at timestamptz,
  completed_at timestamptz,
  qc_photos jsonb default '[]'::jsonb,
  lensometer_readings jsonb,
  shipment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_lab_jobs_column on lab_jobs("column") where completed_at is null;
create index idx_lab_jobs_assigned on lab_jobs(assigned_to) where completed_at is null;

create trigger lab_jobs_updated_at
  before update on lab_jobs
  for each row execute function update_updated_at();
