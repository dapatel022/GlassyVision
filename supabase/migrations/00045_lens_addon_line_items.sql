-- Lens upgrades are now charged as separate Shopify line items paired to
-- their frame line (spec 2026-07-29-lens-upgrade-charging-design.md).
alter table order_line_items
  add column if not exists line_ref text,
  add column if not exists addon_for_ref text,
  add column if not exists lens_type text,
  add column if not exists coatings text,
  add column if not exists tint text;

comment on column order_line_items.line_ref is 'UUID minted at checkout on frame lines; add-on lines reference it via addon_for_ref';
comment on column order_line_items.addon_for_ref is 'Non-null marks this line as a lens-upgrade add-on (never fulfilled standalone)';
comment on column order_line_items.lens_type is 'Purchased lens selection (frame lines): non_rx | single_vision | progressive';
comment on column order_line_items.coatings is 'CSV of purchased coating option ids (frame lines)';
comment on column order_line_items.tint is 'Purchased tint option id (frame lines), none for clear';
