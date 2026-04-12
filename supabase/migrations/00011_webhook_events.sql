create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  shopify_event_id text unique not null,
  topic text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create index idx_webhooks_topic on webhook_events(topic);
create index idx_webhooks_unprocessed on webhook_events(received_at) where processed_at is null;
