create type lens_type as enum ('single_vision', 'progressive', 'reading', 'non_prescription');
create type lens_material as enum ('cr39', 'polycarbonate', 'high_index_1_67', 'high_index_1_74');

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  line_item_id uuid not null references order_line_items(id),
  rx_file_id uuid references rx_files(id),
  work_order_number text unique not null,
  frame_sku text not null,
  frame_shape text,
  frame_color text,
  frame_size text,
  frame_eye_size numeric(5,1),
  frame_bridge_size numeric(5,1),
  frame_temple_length numeric(5,1),
  lens_type lens_type not null,
  lens_material lens_material not null default 'cr39',
  coatings jsonb default '[]'::jsonb,
  tint text default 'none',
  monocular_pd_od numeric(4,1),
  monocular_pd_os numeric(4,1),
  fitting_height numeric(4,1),
  decentration_h numeric(4,1),
  decentration_v numeric(4,1),
  base_curve numeric(4,2),
  ed_effective_diameter numeric(5,1),
  axis_double_entered boolean default false,
  special_instructions text,
  pdf_storage_path text,
  version int not null default 1,
  parent_work_order_id uuid references work_orders(id),
  created_at timestamptz not null default now(),
  released_to_lab_at timestamptz
);

create index idx_work_orders_order on work_orders(order_id);
create index idx_work_orders_number on work_orders(work_order_number);
