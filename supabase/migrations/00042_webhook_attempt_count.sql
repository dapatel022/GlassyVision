-- 00042_webhook_attempt_count.sql
-- Poison-pill guard: count reprocess attempts so a permanently-failing payload
-- can be parked instead of retried forever.
alter table webhook_events
  add column if not exists attempt_count int not null default 0;
