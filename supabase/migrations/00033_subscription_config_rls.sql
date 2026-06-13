-- Enable RLS on the subscription CONFIG tables (2026-06-12 audit HIGH).
--
-- 00029 enabled RLS on subscription_memberships and subscription_redemptions but
-- not on subscription_plans / subscription_addon_options, which were created in
-- the same migration. With RLS off, a default Supabase project grants anon /
-- authenticated DML through PostgREST — so plan pricing, pairs_count, policies
-- and add-on pricing were readable AND writable with the public anon key.
--
-- Every legitimate reader/writer uses the service-role admin client (which
-- bypasses RLS), so enabling RLS with NO policy is correct deny-all for the
-- public roles and changes nothing for the server.
alter table subscription_plans enable row level security;
alter table subscription_addon_options enable row level security;
