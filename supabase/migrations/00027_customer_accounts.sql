-- Customer accounts foundation (sub-project 0).
-- Links the CRM `customers` row to a Supabase Auth identity. Customers have an
-- auth.users row but NO profiles row, so staff middleware (getCurrentUser) keeps
-- rejecting them. This is the first customer-facing RLS in the codebase.

alter table customers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists idx_customers_auth_user_id
  on customers(auth_user_id)
  where auth_user_id is not null;

-- Helper: the customers.id owned by the current auth user (null for staff/anon).
create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from customers where auth_user_id = auth.uid()
$$;

-- Customers read ONLY their own row. Staff/app writes go through the
-- service-role client (bypasses RLS); this policy is the customer read path +
-- defense in depth. Mutations have no customer/anon policy → denied by default.
alter table customers enable row level security;

drop policy if exists "Customer reads own row" on customers;
create policy "Customer reads own row"
  on customers for select
  using (auth_user_id = auth.uid());
