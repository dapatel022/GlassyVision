-- Seed data for local development
-- Run with: npx supabase db reset (automatically runs seed.sql after migrations)

-- ============================================================
-- Test users (auth.users + profiles)
-- Password for all test users: "password123"
-- ============================================================

-- Founder / admin user
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
values (
  'a0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'founder@glassyvision.dev',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"full_name": "Dev Founder"}'::jsonb,
  now(), now(), '', '', '', '', '', '', '', ''
);

-- Reviewer (Rx image reviewer)
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
values (
  'a0000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'reviewer@glassyvision.dev',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"full_name": "Dev Reviewer"}'::jsonb,
  now(), now(), '', '', '', '', '', '', '', ''
);

-- Lab admin
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
values (
  'a0000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'labadmin@glassyvision.dev',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"full_name": "Dev Lab Admin"}'::jsonb,
  now(), now(), '', '', '', '', '', '', '', ''
);

-- Lab operator
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
values (
  'a0000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'labop@glassyvision.dev',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"full_name": "Dev Lab Operator"}'::jsonb,
  now(), now(), '', '', '', '', '', '', '', ''
);

-- The on_auth_user_created trigger fires automatically and creates profiles.
-- Now update roles (trigger defaults to 'lab_operator').
update profiles set role = 'founder' where id = 'a0000000-0000-0000-0000-000000000001';
update profiles set role = 'reviewer' where id = 'a0000000-0000-0000-0000-000000000002';
update profiles set role = 'lab_admin' where id = 'a0000000-0000-0000-0000-000000000003';
-- lab_operator is already the default, no update needed for user 4

-- ============================================================
-- Drops
-- ============================================================
insert into drops (slug, name, number, hero_headline, hero_copy, starts_at, ends_at, state) values
  ('the-first-run', 'The First Run', 1, 'THE FIRST RUN.', 'Eight frames. Hand-finished in a small shop in India.', now(), now() + interval '14 days', 'live');

-- ============================================================
-- Product metadata (mirrors Shopify product catalog)
-- ============================================================
insert into product_metadata (shopify_product_id, shopify_variant_id, sku, frame_shape, frame_material, frame_eye_size, frame_bridge, frame_temple_length, is_rx_capable, is_rx_sunglass_capable) values
  (1001, 2001, 'BOM-RND-TOR', 'round', 'acetate', 49, 21, 145, true, true),
  (1002, 2002, 'JAI-OVL-BLK', 'oval', 'titanium', 51, 19, 140, true, true),
  (1003, 2003, 'KOC-SQR-NAV', 'square', 'acetate', 52, 20, 148, true, true),
  (1004, 2004, 'UDA-AVI-GLD', 'aviator', 'steel', 58, 14, 140, false, false),
  (1005, 2005, 'VAR-CAT-TOR', 'cat-eye', 'acetate', 53, 17, 142, true, true);

-- ============================================================
-- Inventory
-- ============================================================
insert into inventory_pool (shopify_product_id, shopify_variant_id, sku, frame_shape, color, size, pool_quantity, threshold_alert) values
  (1001, 2001, 'BOM-RND-TOR', 'round', 'tortoise', 'M', 10, 3),
  (1002, 2002, 'JAI-OVL-BLK', 'oval', 'black', 'M', 8, 3),
  (1003, 2003, 'KOC-SQR-NAV', 'square', 'navy', 'L', 12, 3),
  (1004, 2004, 'UDA-AVI-GLD', 'aviator', 'gold', 'L', 15, 3),
  (1005, 2005, 'VAR-CAT-TOR', 'cat-eye', 'tortoise', 'M', 7, 3);

-- ============================================================
-- Drop products (link products to the drop)
-- ============================================================
insert into drop_products (drop_id, shopify_product_id, display_order, feature_tier) values
  ((select id from drops where slug = 'the-first-run'), 1001, 1, 'hero'),
  ((select id from drops where slug = 'the-first-run'), 1002, 2, 'hero'),
  ((select id from drops where slug = 'the-first-run'), 1003, 3, 'supporting'),
  ((select id from drops where slug = 'the-first-run'), 1004, 4, 'supporting'),
  ((select id from drops where slug = 'the-first-run'), 1005, 5, 'hero');

-- ============================================================
-- Test customer + order (for Rx intake testing)
-- ============================================================
insert into customers (id, shopify_customer_id, email, first_name, last_name, total_orders, vip_tier) values
  ('c0000000-0000-0000-0000-000000000001', 9001, 'testcustomer@example.com', 'Test', 'Customer', 1, 'none');

insert into orders (id, shopify_order_id, shopify_order_number, customer_id, customer_email, customer_name, billing_country, currency, subtotal, total, tax, shipping_cost, has_rx_items, rx_status, drop_id) values
  ('d0000000-0000-0000-0000-000000000001', 5001, 'GV-1001',
   'c0000000-0000-0000-0000-000000000001', 'testcustomer@example.com', 'Test Customer',
   'us', 'usd', 128.00, 138.00, 10.00, 0.00,
   true, 'awaiting_upload',
   (select id from drops where slug = 'the-first-run'));

insert into order_line_items (id, order_id, shopify_line_item_id, product_id, variant_id, product_handle, product_title, variant_title, sku, quantity, unit_price, line_total, is_rx_required, frame_shape, frame_color, frame_size) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
   7001, 1001, 2001, 'bombay-round', 'Bombay Round', 'Tortoise / M',
   'BOM-RND-TOR', 1, 128.00, 128.00, true, 'round', 'tortoise', 'M');
