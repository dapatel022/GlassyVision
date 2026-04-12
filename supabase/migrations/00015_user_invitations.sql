create table user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role user_role not null,
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  invited_by uuid not null references profiles(id),
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_profile_id uuid references profiles(id)
);

create index idx_invitations_token on user_invitations(token) where accepted_at is null;
