-- gen_random_bytes lives in pgcrypto. The local dev image preloads it, but a
-- fresh cloud database does not — without this line the migration fails there.
create extension if not exists pgcrypto with schema extensions;

create table user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role user_role not null,
  -- extensions.-qualified: db push sessions don't have the extensions schema
  -- on their search_path, so an unqualified call fails on cloud.
  token text unique not null default encode(extensions.gen_random_bytes(32), 'hex'),
  invited_by uuid not null references profiles(id),
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_profile_id uuid references profiles(id)
);

create index idx_invitations_token on user_invitations(token) where accepted_at is null;
