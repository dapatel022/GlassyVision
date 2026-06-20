-- ============================================================
-- Subscription demo: a logged-in MEMBER with an active membership + 3 pairs.
-- Idempotent (safe to re-run against a live DB). Mirrors exactly what
-- provisionMembershipFromOrder() creates from a paid membership purchase.
--   login: member@glassyvision.dev / password123
-- ============================================================

-- 1. Customer auth user (same shape as the staff users in seed.sql).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
select 'a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'member@glassyvision.dev',
       crypt('password123', gen_salt('bf')), now(), '{"full_name": "Demo Member"}'::jsonb,
       now(), now(), '', '', '', '', '', '', '', ''
where not exists (select 1 from auth.users where email = 'member@glassyvision.dev');

-- The on_auth_user_created trigger makes a profiles row; a customer is not staff,
-- so pin it to 'pending' (no /admin or /lab access).
update profiles set role = 'pending' where id = 'a0000000-0000-0000-0000-000000000005';

-- 2. Customer record linked to that login.
insert into customers (id, email, first_name, last_name, auth_user_id)
select 'c5000000-0000-0000-0000-000000000005', 'member@glassyvision.dev', 'Demo', 'Member',
       'a0000000-0000-0000-0000-000000000005'
where not exists (select 1 from customers where auth_user_id = 'a0000000-0000-0000-0000-000000000005');

-- 3. Active membership on the seeded annual plan (term/policies copied from the plan,
--    exactly as provisionMembershipFromOrder does). shopify_order_id is a fake unique id.
insert into subscription_memberships (id, plan_id, customer_id, shopify_order_id, status, term_start, term_end, pairs_total, redemption_policy, end_of_term_policy)
select 'b5000000-0000-0000-0000-000000000005', p.id, 'c5000000-0000-0000-0000-000000000005',
       990001, 'active', now(), now() + (p.term_months || ' months')::interval,
       p.pairs_count, p.redemption_policy, p.end_of_term_policy
from subscription_plans p
where p.name ilike 'GlassyVision Annual%' and p.status = 'active'
  and not exists (select 1 from subscription_memberships where shopify_order_id = 990001)
order by p.created_at
limit 1;

-- 4. One available redemption slot per covered pair (all-immediate unlock = now).
insert into subscription_redemptions (membership_id, slot_index, status, unlocks_at)
select 'b5000000-0000-0000-0000-000000000005', g.i, 'available', now()
from generate_series(0, (select pairs_total - 1 from subscription_memberships where id = 'b5000000-0000-0000-0000-000000000005')) as g(i)
where exists (select 1 from subscription_memberships where id = 'b5000000-0000-0000-0000-000000000005')
  and not exists (select 1 from subscription_redemptions where membership_id = 'b5000000-0000-0000-0000-000000000005');
