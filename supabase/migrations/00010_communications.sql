create type comm_channel as enum ('email', 'sms', 'push', 'webhook');
create type comm_direction as enum ('outbound', 'inbound');
create type comm_type as enum (
  'rx_reminder', 'rx_approved', 'rx_rejected', 'order_shipped',
  'return_approved', 'return_shipped', 'welcome', 'drop_launch',
  'review_request', 'rx_escalation', 'waitlist_notify', 'other'
);
create type comm_provider as enum ('resend', 'shopify', 'twilio');
create type comm_status as enum ('queued', 'sent', 'delivered', 'bounced', 'failed');

create table communications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  customer_email text not null,
  channel comm_channel not null default 'email',
  direction comm_direction not null default 'outbound',
  type comm_type not null,
  provider comm_provider not null default 'resend',
  provider_message_id text,
  subject text,
  body_hash text,
  status comm_status not null default 'queued',
  sent_at timestamptz,
  delivered_at timestamptz
);

create index idx_comms_order on communications(order_id);
create index idx_comms_idempotency on communications(order_id, type) where direction = 'outbound';
