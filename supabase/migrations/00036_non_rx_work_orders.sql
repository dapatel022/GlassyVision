-- Non-Rx fulfillment: allow a work order for an item with no prescription
-- (plain sunglasses / plano lenses) WITHOUT weakening the FTC compliance
-- invariant for Rx items. Migration 00024 set rx_file_id NOT NULL globally; we
-- replace that blanket rule with a CONDITIONAL one keyed on requires_rx.

alter table work_orders
  add column requires_rx boolean not null default true;

-- Every existing row is an Rx work order (default true) with a non-null
-- rx_file_id, so the conditional CHECK below already holds for all current data.
alter table work_orders
  alter column rx_file_id drop not null;

-- The compliance invariant, now conditional: an Rx work order MUST still have
-- an Rx image on file; a non-Rx work order may have none.
alter table work_orders
  add constraint work_orders_rx_image_required
  check (requires_rx = false or rx_file_id is not null);

-- Non-Rx idempotency: the Rx path dedups on rx_file_id (guarded in code); the
-- non-Rx path dedups on line_item_id. A line item is either Rx or non-Rx, so a
-- partial unique index over non-Rx rows prevents duplicate non-Rx work orders.
create unique index work_orders_non_rx_line_item_uniq
  on work_orders(line_item_id) where requires_rx = false;
