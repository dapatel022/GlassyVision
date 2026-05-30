-- New profiles default to the zero-access 'pending' role. Real roles are
-- assigned only via invitation acceptance (see accept-invite.ts) or by a
-- founder. Closes the hole where self-signed-up users defaulted to
-- 'lab_operator' and thereby gained /lab access.
alter table profiles alter column role set default 'pending';

-- The trigger that mirrors auth.users -> profiles must also default to
-- 'pending'. `on conflict do nothing` makes it idempotent so the admin-driven
-- invite flow (which provisions the auth user then upserts the profile role)
-- doesn't collide with this trigger.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'pending')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;
