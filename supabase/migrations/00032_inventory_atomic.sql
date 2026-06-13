-- Atomic single-unit inventory reserve/release (2026-06-12 audit C8).
--
-- The application previously reserved/released stock with a read-modify-write in
-- JS (SELECT pool_quantity → check → UPDATE pool_quantity = n ± 1). Two
-- concurrent redemptions of the last unit both read the same value, both passed
-- the check, and both wrote — overselling the unit and desyncing the ledger from
-- the pool (the `pool_quantity >= 0` constraint can't catch a computed
-- non-negative write). These functions make the mutation atomic via a single
-- conditional `UPDATE ... RETURNING`, and write the ledger row in the same
-- statement so the pool and ledger never drift.

-- Link adjustments to the redemption that caused them, so reserve/release pairs
-- are checkable without parsing free-text notes.
alter table inventory_adjustments
  add column if not exists reference_redemption_id uuid references subscription_redemptions(id);

-- Reserve one unit. Returns the affected pool id, or NULL when the variant has no
-- pool row or is out of stock (the `pool_quantity > 0` guard fails atomically).
create or replace function reserve_inventory_unit(
  p_variant_id bigint,
  p_reason adjustment_reason,
  p_redemption_id uuid default null,
  p_notes text default null
) returns uuid
language plpgsql
as $$
declare
  v_pool_id uuid;
begin
  update inventory_pool
     set pool_quantity = pool_quantity - 1,
         last_updated_at = now()
   where shopify_variant_id = p_variant_id
     and pool_quantity > 0
  returning id into v_pool_id;

  if v_pool_id is null then
    return null;
  end if;

  insert into inventory_adjustments (inventory_pool_id, delta, reason, reference_redemption_id, notes)
  values (v_pool_id, -1, p_reason, p_redemption_id, p_notes);

  return v_pool_id;
end;
$$;

-- Release one unit back to the pool. Returns the affected pool id, or NULL when
-- the variant has no pool row.
create or replace function release_inventory_unit(
  p_variant_id bigint,
  p_reason adjustment_reason,
  p_redemption_id uuid default null,
  p_notes text default null
) returns uuid
language plpgsql
as $$
declare
  v_pool_id uuid;
begin
  update inventory_pool
     set pool_quantity = pool_quantity + 1,
         last_updated_at = now()
   where shopify_variant_id = p_variant_id
  returning id into v_pool_id;

  if v_pool_id is null then
    return null;
  end if;

  insert into inventory_adjustments (inventory_pool_id, delta, reason, reference_redemption_id, notes)
  values (v_pool_id, 1, p_reason, p_redemption_id, p_notes);

  return v_pool_id;
end;
$$;
