-- 00041_rx_prism.sql
-- Optional prism correction, typed double-check values only (the approved image
-- remains authoritative). Amount in prism diopters; base is one of up/down/in/out.
alter table rx_files
  add column if not exists typed_od_prism text,
  add column if not exists typed_os_prism text,
  add column if not exists typed_od_base  text,
  add column if not exists typed_os_base  text;
