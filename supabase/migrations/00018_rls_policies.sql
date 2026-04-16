-- Enable RLS on all tables
alter table profiles enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_line_items enable row level security;
alter table rx_files enable row level security;
alter table rx_reviews enable row level security;
alter table work_orders enable row level security;
alter table lab_jobs enable row level security;
alter table inventory_pool enable row level security;
alter table inventory_adjustments enable row level security;
alter table returns enable row level security;
alter table communications enable row level security;
alter table webhook_events enable row level security;
alter table audit_log enable row level security;
alter table drops enable row level security;
alter table drop_products enable row level security;
alter table product_metadata enable row level security;
alter table user_invitations enable row level security;
alter table shipments enable row level security;
alter table waitlist enable row level security;

-- Helper: get current user's role
create or replace function auth.user_role()
returns user_role as $$
  select role from profiles where id = auth.uid()
$$ language sql security definer stable;

-- Helper: check if user has one of the given roles
create or replace function auth.has_role(allowed_roles user_role[])
returns boolean as $$
  select auth.user_role() = any(allowed_roles)
$$ language sql security definer stable;

-- Profiles: users can read own, founder can read all
create policy "Users can read own profile"
  on profiles for select using (id = auth.uid());
create policy "Founder can read all profiles"
  on profiles for select using (auth.user_role() = 'founder');
create policy "Users can update own profile"
  on profiles for update using (id = auth.uid());

-- Orders: customer sees own, ops roles see all
create policy "Founder/reviewer read all orders"
  on orders for select using (
    auth.has_role(array['founder', 'reviewer', 'lab_admin']::user_role[])
  );

-- Rx files: reviewer + founder can read/write, anon can insert via API (service role)
create policy "Founder/reviewer read rx_files"
  on rx_files for select using (
    auth.has_role(array['founder', 'reviewer']::user_role[])
  );

-- Rx reviews: reviewer/founder can insert
create policy "Reviewer can insert rx_reviews"
  on rx_reviews for insert with check (
    auth.has_role(array['founder', 'reviewer']::user_role[])
  );
create policy "Founder can read rx_reviews"
  on rx_reviews for select using (
    auth.has_role(array['founder', 'reviewer']::user_role[])
  );

-- Work orders: lab roles + founder can read
create policy "Lab and founder read work_orders"
  on work_orders for select using (
    auth.has_role(array['founder', 'reviewer', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping']::user_role[])
  );

-- Lab jobs: lab roles can read/update their scope
create policy "Lab roles read lab_jobs"
  on lab_jobs for select using (
    auth.has_role(array['founder', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping']::user_role[])
  );
create policy "Lab roles update lab_jobs"
  on lab_jobs for update using (
    auth.has_role(array['founder', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping']::user_role[])
  );

-- Inventory: lab_admin and founder can write, all lab can read
create policy "Lab reads inventory"
  on inventory_pool for select using (
    auth.has_role(array['founder', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping']::user_role[])
  );
create policy "Lab admin writes inventory"
  on inventory_pool for all using (
    auth.has_role(array['founder', 'lab_admin']::user_role[])
  );

-- Inventory adjustments: lab can insert, founder/admin can read
create policy "Lab inserts adjustments"
  on inventory_adjustments for insert with check (
    auth.has_role(array['founder', 'lab_admin', 'lab_operator']::user_role[])
  );
create policy "Founder reads adjustments"
  on inventory_adjustments for select using (
    auth.has_role(array['founder', 'lab_admin']::user_role[])
  );

-- Returns: founder can read/write all
create policy "Founder manages returns"
  on returns for all using (auth.user_role() = 'founder');

-- Communications: founder only
create policy "Founder reads communications"
  on communications for select using (auth.user_role() = 'founder');

-- Audit log: founder only
create policy "Founder reads audit_log"
  on audit_log for select using (auth.user_role() = 'founder');

-- Drops: public read, founder write
create policy "Public reads drops"
  on drops for select using (true);
create policy "Founder manages drops"
  on drops for all using (auth.user_role() = 'founder');

-- Drop products: public read
create policy "Public reads drop_products"
  on drop_products for select using (true);

-- Product metadata: public read
create policy "Public reads product_metadata"
  on product_metadata for select using (true);

-- Waitlist: anon can insert, founder can read
create policy "Anon inserts waitlist"
  on waitlist for insert with check (true);
create policy "Founder reads waitlist"
  on waitlist for select using (auth.user_role() = 'founder');

-- Shipments: lab and founder can read/write
create policy "Lab and founder manage shipments"
  on shipments for all using (
    auth.has_role(array['founder', 'lab_admin', 'lab_shipping']::user_role[])
  );

-- User invitations: founder can manage
create policy "Founder manages invitations"
  on user_invitations for all using (auth.user_role() = 'founder');
