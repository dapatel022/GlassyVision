create type rx_decision as enum ('approved', 'rejected', 'needs_info');
create type rx_rejection_reason as enum (
  'clean_approved', 'matches_typed_values', 'image_too_blurry',
  'mismatch_typed_vs_image', 'expired_rx', 'suspicious',
  'wrong_document_type', 'other'
);

create table rx_reviews (
  id uuid primary key default gen_random_uuid(),
  rx_file_id uuid not null references rx_files(id),
  reviewer_user_id uuid not null references profiles(id),
  decision rx_decision not null,
  decision_reason rx_rejection_reason not null,
  notes text,
  reviewed_at timestamptz not null default now()
);

create index idx_rx_reviews_file on rx_reviews(rx_file_id);
