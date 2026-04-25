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

-- ============================================================
-- GV-1002: Rx uploaded, awaiting reviewer decision
-- ============================================================
insert into customers (id, shopify_customer_id, email, first_name, last_name, total_orders, vip_tier) values
  ('c0000000-0000-0000-0000-000000000002', 9002, 'priya@example.com', 'Priya', 'Shah', 1, 'none');

insert into orders (id, shopify_order_id, shopify_order_number, customer_id, customer_email, customer_name, billing_country, currency, subtotal, total, tax, shipping_cost, has_rx_items, rx_status, drop_id, created_at) values
  ('d0000000-0000-0000-0000-000000000002', 5002, 'GV-1002',
   'c0000000-0000-0000-0000-000000000002', 'priya@example.com', 'Priya Shah',
   'ca', 'usd', 148.00, 158.00, 10.00, 0.00,
   true, 'uploaded_pending_review',
   (select id from drops where slug = 'the-first-run'),
   now() - interval '2 hours');

insert into order_line_items (id, order_id, shopify_line_item_id, product_id, variant_id, product_handle, product_title, variant_title, sku, quantity, unit_price, line_total, is_rx_required, frame_shape, frame_color, frame_size) values
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002',
   7002, 1002, 2002, 'jaipur-oval', 'Jaipur Oval', 'Black / M',
   'JAI-OVL-BLK', 1, 148.00, 148.00, true, 'oval', 'black', 'M');

insert into rx_files (id, order_id, line_item_id, customer_email, storage_path, original_filename, file_size, mime_type, typed_od_sphere, typed_od_cylinder, typed_od_axis, typed_os_sphere, typed_os_cylinder, typed_os_axis, typed_pd, typed_pd_type, certification_checked, uploaded_at) values
  ('f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002',
   'e0000000-0000-0000-0000-000000000002', 'priya@example.com',
   'GV-1002/e0000000-0000-0000-0000-000000000002/seed.jpg', 'rx-seed.jpg', 26509, 'image/jpeg',
   '-1.75', '-0.25', 90, '-1.50', '-0.25', 85, '60', 'binocular',
   true, now() - interval '90 minutes');

-- ============================================================
-- GV-1003: approved, work order in lab inbox column
-- ============================================================
insert into customers (id, shopify_customer_id, email, first_name, last_name, total_orders, vip_tier) values
  ('c0000000-0000-0000-0000-000000000003', 9003, 'arjun@example.com', 'Arjun', 'Patel', 2, 'none');

insert into orders (id, shopify_order_id, shopify_order_number, customer_id, customer_email, customer_name, billing_country, currency, subtotal, total, tax, shipping_cost, has_rx_items, rx_status, drop_id, created_at) values
  ('d0000000-0000-0000-0000-000000000003', 5003, 'GV-1003',
   'c0000000-0000-0000-0000-000000000003', 'arjun@example.com', 'Arjun Patel',
   'us', 'usd', 138.00, 148.00, 10.00, 0.00,
   true, 'approved',
   (select id from drops where slug = 'the-first-run'),
   now() - interval '6 hours');

insert into order_line_items (id, order_id, shopify_line_item_id, product_id, variant_id, product_handle, product_title, variant_title, sku, quantity, unit_price, line_total, is_rx_required, frame_shape, frame_color, frame_size) values
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003',
   7003, 1003, 2003, 'kochi-square', 'Kochi Square', 'Navy / L',
   'KOC-SQR-NAV', 1, 138.00, 138.00, true, 'square', 'navy', 'L');

insert into rx_files (id, order_id, line_item_id, customer_email, storage_path, original_filename, file_size, mime_type, typed_od_sphere, typed_os_sphere, typed_pd, typed_pd_type, certification_checked, uploaded_at) values
  ('f0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003',
   'e0000000-0000-0000-0000-000000000003', 'arjun@example.com',
   'GV-1003/e0000000-0000-0000-0000-000000000003/seed.jpg', 'rx-seed.jpg', 26509, 'image/jpeg',
   '-3.0', '-3.25', '64', 'binocular',
   true, now() - interval '5 hours');

insert into rx_reviews (id, rx_file_id, reviewer_user_id, decision, decision_reason, reviewed_at) values
  ('aa000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001', 'approved', 'clean_approved', now() - interval '4 hours');

insert into work_orders (id, order_id, line_item_id, rx_file_id, work_order_number, frame_sku, frame_shape, frame_color, frame_size, frame_eye_size, frame_bridge_size, frame_temple_length, lens_type, lens_material, monocular_pd_od, monocular_pd_os, special_instructions, version, created_at, released_to_lab_at) values
  ('b1000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003',
   'WO-202604-100', 'KOC-SQR-NAV', 'square', 'navy', 'L', 52, 20, 148, 'single_vision', 'cr39',
   '32.0', '32.0', null, 1, now() - interval '4 hours', now() - interval '4 hours');

insert into lab_jobs (id, work_order_id, "column", priority, started_at, created_at) values
  ('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000003', 'inbox', 5, null, now() - interval '4 hours');

-- ============================================================
-- GV-1004: approved, lab job currently on_bench (in production)
-- ============================================================
insert into customers (id, shopify_customer_id, email, first_name, last_name, total_orders, vip_tier) values
  ('c0000000-0000-0000-0000-000000000004', 9004, 'meera@example.com', 'Meera', 'Iyer', 3, 'returning');

insert into orders (id, shopify_order_id, shopify_order_number, customer_id, customer_email, customer_name, billing_country, currency, subtotal, total, tax, shipping_cost, has_rx_items, rx_status, drop_id, created_at) values
  ('d0000000-0000-0000-0000-000000000004', 5004, 'GV-1004',
   'c0000000-0000-0000-0000-000000000004', 'meera@example.com', 'Meera Iyer',
   'us', 'usd', 158.00, 168.00, 10.00, 0.00,
   true, 'approved',
   (select id from drops where slug = 'the-first-run'),
   now() - interval '36 hours');

insert into order_line_items (id, order_id, shopify_line_item_id, product_id, variant_id, product_handle, product_title, variant_title, sku, quantity, unit_price, line_total, is_rx_required, frame_shape, frame_color, frame_size) values
  ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004',
   7004, 1005, 2005, 'varanasi-cat', 'Varanasi Cat-eye', 'Tortoise / M',
   'VAR-CAT-TOR', 1, 158.00, 158.00, true, 'cat-eye', 'tortoise', 'M');

insert into rx_files (id, order_id, line_item_id, customer_email, storage_path, original_filename, file_size, mime_type, typed_od_sphere, typed_os_sphere, typed_pd, typed_pd_type, certification_checked, uploaded_at) values
  ('f0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004',
   'e0000000-0000-0000-0000-000000000004', 'meera@example.com',
   'GV-1004/e0000000-0000-0000-0000-000000000004/seed.jpg', 'rx-seed.jpg', 26509, 'image/jpeg',
   '-4.5', '-4.25', '63', 'binocular',
   true, now() - interval '30 hours');

insert into rx_reviews (id, rx_file_id, reviewer_user_id, decision, decision_reason, reviewed_at) values
  ('aa000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000001', 'approved', 'clean_approved', now() - interval '28 hours');

insert into work_orders (id, order_id, line_item_id, rx_file_id, work_order_number, frame_sku, frame_shape, frame_color, frame_size, frame_eye_size, frame_bridge_size, frame_temple_length, lens_type, lens_material, monocular_pd_od, monocular_pd_os, version, created_at, released_to_lab_at) values
  ('b1000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000004',
   'WO-202604-101', 'VAR-CAT-TOR', 'cat-eye', 'tortoise', 'M', 53, 17, 142, 'single_vision', 'polycarbonate',
   '31.5', '31.5', 1, now() - interval '28 hours', now() - interval '28 hours');

insert into lab_jobs (id, work_order_id, "column", priority, started_at, created_at) values
  ('c1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000004', 'on_bench', 7, now() - interval '6 hours', now() - interval '28 hours');

-- ============================================================
-- GV-1005: fully shipped (all 4 customer-visible stages complete)
-- ============================================================
insert into customers (id, shopify_customer_id, email, first_name, last_name, total_orders, vip_tier) values
  ('c0000000-0000-0000-0000-000000000005', 9005, 'rohan@example.com', 'Rohan', 'Gupta', 1, 'none');

insert into orders (id, shopify_order_id, shopify_order_number, customer_id, customer_email, customer_name, billing_country, currency, subtotal, total, tax, shipping_cost, has_rx_items, rx_status, fulfillment_status, drop_id, created_at) values
  ('d0000000-0000-0000-0000-000000000005', 5005, 'GV-1005',
   'c0000000-0000-0000-0000-000000000005', 'rohan@example.com', 'Rohan Gupta',
   'us', 'usd', 128.00, 138.00, 10.00, 0.00,
   true, 'approved', 'shipped',
   (select id from drops where slug = 'the-first-run'),
   now() - interval '7 days');

insert into order_line_items (id, order_id, shopify_line_item_id, product_id, variant_id, product_handle, product_title, variant_title, sku, quantity, unit_price, line_total, is_rx_required, frame_shape, frame_color, frame_size) values
  ('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000005',
   7005, 1001, 2001, 'bombay-round', 'Bombay Round', 'Tortoise / M',
   'BOM-RND-TOR', 1, 128.00, 128.00, true, 'round', 'tortoise', 'M');

insert into rx_files (id, order_id, line_item_id, customer_email, storage_path, original_filename, file_size, mime_type, certification_checked, uploaded_at) values
  ('f0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000005',
   'e0000000-0000-0000-0000-000000000005', 'rohan@example.com',
   'GV-1005/e0000000-0000-0000-0000-000000000005/seed.jpg', 'rx-seed.jpg', 26509, 'image/jpeg',
   true, now() - interval '6 days 22 hours');

insert into rx_reviews (id, rx_file_id, reviewer_user_id, decision, decision_reason, reviewed_at) values
  ('aa000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000005',
   'a0000000-0000-0000-0000-000000000001', 'approved', 'clean_approved', now() - interval '6 days 20 hours');

insert into work_orders (id, order_id, line_item_id, rx_file_id, work_order_number, frame_sku, frame_shape, frame_color, frame_size, frame_eye_size, frame_bridge_size, frame_temple_length, lens_type, lens_material, monocular_pd_od, monocular_pd_os, version, created_at, released_to_lab_at) values
  ('b1000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000005',
   'WO-202604-102', 'BOM-RND-TOR', 'round', 'tortoise', 'M', 49, 21, 145, 'single_vision', 'cr39',
   '32.0', '32.0', 1, now() - interval '6 days 20 hours', now() - interval '6 days 20 hours');

insert into shipments (id, order_id, direction, carrier, tracking_number, status, shipped_at) values
  ('d2000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000005',
   'outbound', 'FedEx', 'FX5550000000', 'in_transit', now() - interval '2 days');

insert into lab_jobs (id, work_order_id, "column", priority, started_at, completed_at, shipment_id, created_at) values
  ('c1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000005', 'ship', 5,
   now() - interval '6 days', now() - interval '2 days',
   'd2000000-0000-0000-0000-000000000005', now() - interval '6 days 20 hours');
