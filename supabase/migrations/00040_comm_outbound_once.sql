-- 00040_comm_outbound_once.sql
-- Make the transactional-email dedup atomic: at most one outbound, non-failed
-- communications row per (order_id, type) for the two once-per-order intake
-- emails. Scoped to these types so multi-send types (rx_reminder per day,
-- lifecycle emails) are unaffected. Excludes 'failed' so a failed send retries.
create unique index if not exists uniq_comm_outbound_once
  on communications (order_id, type)
  where direction = 'outbound'
    and status <> 'failed'
    and type in ('rx_received', 'rx_approved');
