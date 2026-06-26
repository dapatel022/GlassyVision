-- 00043_guest_customer_dedupe.sql

-- 1) Consolidate any pre-existing guest duplicates so the unique index below can
--    be created. (Fresh DB: a no-op.) Keep the oldest guest row per lower(email);
--    repoint known customer_id FKs to it, then delete the extras.
--    Emailless sentinel 'no-email@shopify.com' is excluded — distinct anonymous
--    buyers all share that placeholder and must NOT be merged.
with keepers as (
  select distinct on (lower(email)) lower(email) as le, id as keep_id
  from customers
  where shopify_customer_id is null and email <> 'no-email@shopify.com'
  order by lower(email), created_at asc, id asc
),
dupes as (
  select c.id as dup_id, k.keep_id
  from customers c
  join keepers k on k.le = lower(c.email)
  where c.shopify_customer_id is null and c.email <> 'no-email@shopify.com' and c.id <> k.keep_id
)
update orders o set customer_id = d.keep_id
from dupes d where o.customer_id = d.dup_id;

-- repoint subscription memberships + saved addresses, if those tables exist
update subscription_memberships m
set customer_id = k.keep_id
from keepers k
where m.customer_id in (
  select c.id from customers c
  where c.shopify_customer_id is null and c.email <> 'no-email@shopify.com' and lower(c.email) = k.le and c.id <> k.keep_id
);

update customer_saved_addresses a
set customer_id = k.keep_id
from keepers k
where a.customer_id in (
  select c.id from customers c
  where c.shopify_customer_id is null and c.email <> 'no-email@shopify.com' and lower(c.email) = k.le and c.id <> k.keep_id
);

delete from customers c
using keepers k
where c.shopify_customer_id is null and c.email <> 'no-email@shopify.com' and lower(c.email) = k.le and c.id <> k.keep_id;

-- 2) Enforce one guest row per email going forward.
--    Emailless sentinel 'no-email@shopify.com' is excluded so distinct anonymous
--    buyers (who share this placeholder) remain separate rows.
create unique index if not exists uniq_guest_customer_email
  on customers (lower(email))
  where shopify_customer_id is null and email <> 'no-email@shopify.com';

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
  v_keep_shopify bigint;
  v_count int;
  v_dup record;
begin
  -- Claimable rows for this verified email: still unclaimed, OR already owned by
  -- this same auth user (so a re-login after a later guest order is idempotent).
  select count(*) into v_count
  from customers
  where lower(email) = lower(p_email)
    and (auth_user_id is null or auth_user_id = p_auth_user_id);

  if v_count = 0 then
    return 0;
  end if;

  -- Canonical keeper: prefer the row already owned by this user (idempotent
  -- re-claim), then a row carrying a Shopify identity (so redact-by-
  -- shopify_customer_id still resolves after the merge), then the oldest.
  select id, shopify_customer_id into v_keep, v_keep_shopify
  from customers
  where lower(email) = lower(p_email)
    and (auth_user_id is null or auth_user_id = p_auth_user_id)
  order by (auth_user_id = p_auth_user_id) desc nulls last,
           (shopify_customer_id is not null) desc,
           created_at asc, id asc
  limit 1;

  for v_dup in
    select id, shopify_customer_id from customers
    where lower(email) = lower(p_email)
      and (auth_user_id is null or auth_user_id = p_auth_user_id)
      and id <> v_keep
  loop
    update orders set customer_id = v_keep where customer_id = v_dup.id;
    update subscription_memberships set customer_id = v_keep where customer_id = v_dup.id;
    update customer_saved_addresses set customer_id = v_keep where customer_id = v_dup.id;
    -- Delete the duplicate BEFORE adopting its shopify_customer_id so the
    -- partial-unique shopify_customer_id index never sees it on two rows at once.
    delete from customers where id = v_dup.id;
    if v_keep_shopify is null and v_dup.shopify_customer_id is not null then
      update customers set shopify_customer_id = v_dup.shopify_customer_id where id = v_keep;
      v_keep_shopify := v_dup.shopify_customer_id;
    end if;
  end loop;

  update customers set auth_user_id = p_auth_user_id
  where id = v_keep and auth_user_id is distinct from p_auth_user_id;

  return v_count;
end;
$$;

revoke all on function claim_customers_by_verified_email(uuid, text) from public, anon, authenticated;
grant execute on function claim_customers_by_verified_email(uuid, text) to service_role;
