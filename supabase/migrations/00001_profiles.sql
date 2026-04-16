-- Profiles: extends Supabase Auth users with role + display info
create type user_role as enum (
  'founder', 'reviewer', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping'
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  full_name text not null default '',
  role user_role not null default 'lab_operator',
  avatar_url text,
  last_active_at timestamptz,
  invitation_id uuid,
  timezone text default 'Asia/Kolkata',
  preferred_notification_channels jsonb default '["email"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();
