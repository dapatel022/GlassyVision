alter table communications
  add column metadata jsonb not null default '{}'::jsonb;

create unique index uniq_rx_reminder_per_order_day
  on communications(order_id, ((metadata ->> 'reminder_day')::int))
  where type = 'rx_reminder' and direction = 'outbound';
