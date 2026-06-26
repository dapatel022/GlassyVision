-- 00043_guest_customer_dedupe.sql

-- 1) Consolidate any pre-existing guest duplicates so the unique index below can
--    be created. (Fresh DB: a no-op.) Keep the oldest guest row per lower(email);
--    repoint known customer_id FKs to it, then delete the extras.
with keepers as (
  select distinct on (lower(email)) lower(email) as le, id as keep_id
  from customers
  where shopify_customer_id is null
  order by lower(email), created_at asc, id asc
),
dupes as (
  select c.id as dup_id, k.keep_id
  from customers c
  join keepers k on k.le = lower(c.email)
  where c.shopify_customer_id is null and c.id <> k.keep_id
)
update orders o set customer_id = d.keep_id
from dupes d where o.customer_id = d.dup_id;

-- repoint subscription memberships + saved addresses, if those tables exist
update subscription_memberships m
set customer_id = k.keep_id
from keepers k
where m.customer_id in (
  select c.id from customers c
  where c.shopify_customer_id is null and lower(c.email) = k.le and c.id <> k.keep_id
);

update customer_saved_addresses a
set customer_id = k.keep_id
from keepers k
where a.customer_id in (
  select c.id from customers c
  where c.shopify_customer_id is null and lower(c.email) = k.le and c.id <> k.keep_id
);

delete from customers c
using keepers k
where c.shopify_customer_id is null and lower(c.email) = k.le and c.id <> k.keep_id;

-- 2) Enforce one guest row per email going forward.
create unique index if not exists uniq_guest_customer_email
  on customers (lower(email))
  where shopify_customer_id is null;

-- 3) Atomic account-claim: bind ALL unclaimed rows for a verified email to one
--    auth user, consolidating onto the oldest (so the auth_user_id unique index
--    can never be violated by multiple matches, e.g. a guest row + a Shopify-
--    customer row sharing the email). Returns the number of source rows claimed.
create or replace function claim_customers_by_verified_email(p_auth_user_id uuid, p_email text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keep uuid;
  v_count int;
  v_dup uuid;
begin
  select id into v_keep
  from customers
  where auth_user_id is null and lower(email) = lower(p_email)
  order by created_at asc, id asc
  limit 1;

  if v_keep is null then
    return 0;
  end if;

  select count(*) into v_count
  from customers
  where auth_user_id is null and lower(email) = lower(p_email);

  for v_dup in
    select id from customers
    where auth_user_id is null and lower(email) = lower(p_email) and id <> v_keep
  loop
    update orders set customer_id = v_keep where customer_id = v_dup;
    update subscription_memberships set customer_id = v_keep where customer_id = v_dup;
    update customer_saved_addresses set customer_id = v_keep where customer_id = v_dup;
    delete from customers where id = v_dup;
  end loop;

  update customers set auth_user_id = p_auth_user_id where id = v_keep;
  return v_count;
end;
$$;

revoke all on function claim_customers_by_verified_email(uuid, text) from public, anon, authenticated;
grant execute on function claim_customers_by_verified_email(uuid, text) to service_role;
