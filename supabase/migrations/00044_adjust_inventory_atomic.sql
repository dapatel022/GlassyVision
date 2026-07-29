-- Atomic manual inventory adjustment (2026-07-28 back-office audit, finding #4).
--
-- adjustInventory previously did SELECT pool_quantity → check → UPDATE in JS —
-- the exact lost-update race 00032 fixed for the reserve/release path. Two
-- concurrent adjustments both read the same starting value and the second
-- write silently clobbered the first, desyncing the pool from its own
-- adjustments ledger. Same cure: one conditional UPDATE ... RETURNING, with
-- the ledger row written in the same function so pool and ledger never drift.

create or replace function adjust_inventory_pool(
  p_pool_id uuid,
  p_delta int,
  p_reason adjustment_reason,
  p_user_id uuid,
  p_notes text default null
) returns int
language plpgsql
as $$
declare
  v_new_qty int;
begin
  update inventory_pool
     set pool_quantity = pool_quantity + p_delta,
         last_updated_by = p_user_id,
         last_updated_at = now()
   where id = p_pool_id
     and pool_quantity + p_delta >= 0
  returning pool_quantity into v_new_qty;

  if v_new_qty is null then
    return null;
  end if;

  insert into inventory_adjustments (inventory_pool_id, delta, reason, user_id, notes)
  values (p_pool_id, p_delta, p_reason, p_user_id, p_notes);

  return v_new_qty;
end;
$$;

-- Service-role only, same rationale as 00032: PUBLIC EXECUTE + PostgREST would
-- let any anon/authenticated key holder mutate stock directly.
revoke execute on function adjust_inventory_pool(uuid, int, adjustment_reason, uuid, text) from public;
grant execute on function adjust_inventory_pool(uuid, int, adjustment_reason, uuid, text) to service_role;
