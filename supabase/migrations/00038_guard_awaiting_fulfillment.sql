-- Add awaiting_fulfillment to the committed set guarded by the terminal trigger
-- (mirrors COMMITTED_STATUSES in the membership-expiry cron). A non-Rx pair in
-- flight must not be silently dropped by an expiry/refund/cancel.
create or replace function guard_membership_terminal()
returns trigger language plpgsql as $$
begin
  if new.status in ('expired','refunded','cancelled') then
    if exists (
      select 1 from subscription_redemptions r
      where r.membership_id = new.id
        and r.status in ('awaiting_rx','awaiting_fulfillment','in_review','in_production','shipped')
    ) then
      raise exception 'cannot set membership % to % while a slot is committed', new.id, new.status;
    end if;
  end if;
  return new;
end $$;
