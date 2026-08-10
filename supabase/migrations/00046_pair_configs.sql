-- 00046_pair_configs.sql
-- Purchase-time pair configurations for membership lines (_pair_N checkout
-- attributes, parsed by order sync). NULL for every non-membership line.
alter table order_line_items add column pair_configs jsonb;
comment on column order_line_items.pair_configs is
  'Array of PairConfig objects ({v,h,l,u,t,b?}) parsed from _pair_N line attributes on membership (SUB-*) lines; null otherwise.';
