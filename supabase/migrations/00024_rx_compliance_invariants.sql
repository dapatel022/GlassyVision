-- THE core compliance invariant, enforced at the DB level (not just app code):
-- a lab work order cannot exist without an Rx image on file. generate-work-order
-- always sets rx_file_id; this makes the schema reject any path that wouldn't.
--
-- Remove any legacy non-compliant rows first so SET NOT NULL is safe to apply
-- to a populated dev/staging DB. A work order with no rx_file_id already
-- violates the rule we are enforcing, so deleting it (and its lab job) is the
-- correct remediation. Pre-launch there should be zero such rows.
delete from lab_jobs where work_order_id in (select id from work_orders where rx_file_id is null);
delete from work_orders where rx_file_id is null;

alter table work_orders alter column rx_file_id set not null;

-- 3-year Rx retention (FTC Eyeglass Rule). Rx files may only ever be
-- soft-deleted (set deleted_at); a hard DELETE is blocked at the DB level so
-- retention cannot be violated by app code, an ad-hoc query, or a future FK
-- cascade. review-rx soft-deletes on rejection, which remains allowed.
create or replace function prevent_rx_file_hard_delete()
returns trigger as $$
begin
  raise exception 'rx_files are retained for compliance (FTC Eyeglass Rule, 3 years) — soft-delete via deleted_at instead of DELETE';
end;
$$ language plpgsql;

create trigger rx_files_no_hard_delete
  before delete on rx_files
  for each row execute function prevent_rx_file_hard_delete();
