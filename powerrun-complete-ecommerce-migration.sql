-- PowerRun Industries Complete E-Commerce Database Schema
-- Run once in Supabase SQL Editor
-- This migration enhances the existing schema with warranty, service, and delivery tracking

-- ============================================================================
-- 1. ENHANCE ORDERS TABLE
-- ============================================================================

alter table public.orders add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists shipping_address_id uuid;
alter table public.orders add column if not exists billing_address_id uuid;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists courier_partner text;
alter table public.orders add column if not exists expected_delivery_date date;
alter table public.orders add column if not exists actual_delivery_date date;
alter table public.orders add column if not exists delivery_status text default 'not_shipped';
alter table public.orders add column if not exists shipping_cost numeric default 0;
alter table public.orders add column if not exists gst_amount numeric default 0;
alter table public.orders add column if not exists discount_amount numeric default 0;
alter table public.orders add column if not exists refund_amount numeric default 0;
alter table public.orders add column if not exists invoice_number text;
alter table public.orders add column if not exists notes text;

-- ============================================================================
-- 2. CREATE CUSTOMERS TABLE
-- ============================================================================

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  email text,
  mobile text not null,
  default_address_id uuid,
  loyalty_points integer default 0,
  total_orders integer default 0,
  total_spent numeric default 0,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  unique(user_id)
);

-- ============================================================================
-- 3. CREATE CUSTOMER ADDRESSES TABLE
-- ============================================================================

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  address_type text default 'other', -- home, office, other
  street_address text not null,
  city text not null,
  state text not null,
  pincode text not null,
  country text default 'India',
  phone text,
  is_default boolean default false,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- ============================================================================
-- 4. CREATE WARRANTY TABLE
-- ============================================================================

create table if not exists public.warranties (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  order_item_id uuid,
  product_id uuid references public.products(id) on delete cascade,
  product_name text,
  customer_id uuid references public.customers(id),
  serial_number text not null,
  registration_date date default now(),
  warranty_start_date date not null,
  warranty_end_date date not null,
  warranty_period_months integer,
  warranty_type text, -- standard, extended, premium
  status text default 'registered', -- registered, active, expired, claimed
  claim_amount numeric,
  claim_date date,
  claim_status text, -- pending, approved, rejected, resolved
  documents jsonb, -- array of {url, type, uploaded_at}
  notes text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- ============================================================================
-- 5. CREATE SERVICE TICKETS TABLE
-- ============================================================================

create table if not exists public.service_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text unique,
  order_id uuid references public.orders(id) on delete set null,
  warranty_id uuid references public.warranties(id) on delete set null,
  customer_id uuid references public.customers(id),
  user_id uuid references auth.users(id),
  product_id uuid references public.products(id),
  product_name text,
  serial_number text,
  issue_category text, -- installation, repair, maintenance, replacement, other
  issue_description text not null,
  priority text default 'normal', -- low, normal, high, urgent
  status text default 'open', -- open, assigned, in_progress, waiting_for_customer, resolved, closed
  assigned_to text, -- admin user id
  assigned_date timestamp,
  resolution_notes text,
  attachments jsonb, -- array of {url, type, uploaded_at}
  created_at timestamp default now(),
  updated_at timestamp default now(),
  resolved_at timestamp
);

-- ============================================================================
-- 6. CREATE SHIPMENTS TABLE
-- ============================================================================

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  shipment_number text unique,
  status text default 'pending', -- pending, confirmed, picked_up, in_transit, out_for_delivery, delivered, failed, returned
  courier_name text,
  tracking_number text,
  tracking_url text,
  picked_up_date timestamp,
  shipped_date timestamp,
  out_for_delivery_date timestamp,
  delivered_date timestamp,
  estimated_delivery_date date,
  delivery_notes text,
  current_location text,
  last_update timestamp,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- ============================================================================
-- 7. CREATE DELIVERY TIMELINE TABLE
-- ============================================================================

create table if not exists public.delivery_timeline (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  status text not null, -- order_placed, confirmed, payment_confirmed, processing, packed, ready_to_ship, shipped, out_for_delivery, delivered
  status_date timestamp default now(),
  description text,
  location text,
  notes text
);

-- ============================================================================
-- 8. CREATE INVOICES TABLE
-- ============================================================================

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid unique references public.orders(id) on delete cascade,
  invoice_number text unique,
  invoice_date date default now(),
  due_date date,
  customer_name text not null,
  customer_email text,
  customer_address text,
  gst_number text,
  subtotal numeric not null,
  gst_amount numeric default 0,
  shipping_cost numeric default 0,
  discount_amount numeric default 0,
  total_amount numeric not null,
  payment_method text,
  payment_status text default 'pending',
  pdf_url text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- ============================================================================
-- 9. CREATE NOTIFICATIONS TABLE
-- ============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  notification_type text, -- order_confirmation, payment_received, order_processing, order_shipped, out_for_delivery, delivery_confirmed, service_update, warranty_registered
  title text not null,
  message text not null,
  email_sent boolean default false,
  whatsapp_sent boolean default false,
  sms_sent boolean default false,
  read boolean default false,
  read_at timestamp,
  created_at timestamp default now()
);

-- ============================================================================
-- 10. UPDATE ORDER ITEMS TABLE
-- ============================================================================

alter table public.order_items add column if not exists warranty_included boolean default true;
alter table public.order_items add column if not exists gst_percentage numeric default 18;
alter table public.order_items add column if not exists gst_amount numeric default 0;

-- ============================================================================
-- 11. CREATE ADMIN USERS TABLE (if not exists)
-- ============================================================================

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role text default 'staff', -- admin, manager, staff
  permissions jsonb default '{}',
  is_active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- ============================================================================
-- 12. CREATE LEADS TABLE (if not exists)
-- ============================================================================

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  mobile text not null,
  email text,
  city text,
  message text,
  source text default 'website', -- website, whatsapp, phone, form
  status text default 'new', -- new, contacted, quoted, converted, closed
  quoted_price numeric,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- ============================================================================
-- 13. RLS POLICIES
-- ============================================================================

-- Enable RLS on all new tables
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.warranties enable row level security;
alter table public.service_tickets enable row level security;
alter table public.shipments enable row level security;
alter table public.delivery_timeline enable row level security;
alter table public.invoices enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_users enable row level security;
alter table public.leads enable row level security;

-- Customers can only see their own customer record
create policy "customers_read_own" on public.customers
  for select to authenticated using (user_id = auth.uid());

create policy "customers_update_own" on public.customers
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Customers can manage their own addresses
create policy "addresses_read_own" on public.customer_addresses
  for select to authenticated using (user_id = auth.uid());

create policy "addresses_insert_own" on public.customer_addresses
  for insert to authenticated with check (user_id = auth.uid());

create policy "addresses_update_own" on public.customer_addresses
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "addresses_delete_own" on public.customer_addresses
  for delete to authenticated using (user_id = auth.uid());

-- Customers can only see warranties for their orders
create policy "warranties_read_own_orders" on public.warranties
  for select to authenticated using (
    customer_id in (select id from customers where user_id = auth.uid())
    or order_id in (select id from orders where user_id = auth.uid())
  );

-- Customers can only see service tickets they created
create policy "service_tickets_read_own" on public.service_tickets
  for select to authenticated using (
    user_id = auth.uid()
    or customer_id in (select id from customers where user_id = auth.uid())
  );

-- Customers can only see their own orders (already have this from migration)
create policy "orders_read_own" on public.orders
  for select to authenticated using (user_id = auth.uid());

-- Customers can see shipments for their orders
create policy "shipments_read_own" on public.shipments
  for select to authenticated using (
    order_id in (select id from orders where user_id = auth.uid())
  );

-- Customers can see their delivery timeline
create policy "delivery_timeline_read_own" on public.delivery_timeline
  for select to authenticated using (
    order_id in (select id from orders where user_id = auth.uid())
  );

-- Customers can see their invoices
create policy "invoices_read_own" on public.invoices
  for select to authenticated using (
    order_id in (select id from orders where user_id = auth.uid())
  );

-- Customers can see their notifications
create policy "notifications_read_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());

-- Admin policies
create policy "admin_users_read" on public.admin_users
  for select to authenticated using (
    exists (select 1 from admin_users where user_id = auth.uid() and is_active = true)
  );

create policy "admin_orders_read" on public.orders
  for select to authenticated using (
    exists (select 1 from admin_users where user_id = auth.uid() and is_active = true)
  );

create policy "admin_orders_update" on public.orders
  for update to authenticated using (
    exists (select 1 from admin_users where user_id = auth.uid() and is_active = true)
  );

create policy "admin_shipments_insert" on public.shipments
  for insert to authenticated with check (
    exists (select 1 from admin_users where user_id = auth.uid() and is_active = true)
  );

create policy "admin_shipments_update" on public.shipments
  for update to authenticated using (
    exists (select 1 from admin_users where user_id = auth.uid() and is_active = true)
  );

create policy "admin_invoices_read" on public.invoices
  for select to authenticated using (
    exists (select 1 from admin_users where user_id = auth.uid() and is_active = true)
  );

-- ============================================================================
-- 14. ENHANCED ORDER CREATION FUNCTION
-- ============================================================================

create or replace function public.create_website_order(
  p_customer jsonb,
  p_items jsonb
)
returns table(order_id uuid, order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_total numeric;
  v_user_id uuid := auth.uid();
  v_customer_id uuid;
begin
  if coalesce(trim(p_customer->>'name'), '') = ''
     or coalesce(trim(p_customer->>'mobile'), '') = '' then
    raise exception 'Name and mobile are required';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one product is required';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
    left join products p on p.id = requested.product_id and p.is_active = true
    where requested.product_id is null
       or requested.quantity is null
       or requested.quantity < 1
       or p.id is null
       or p.price is null
  ) then
    raise exception 'One or more products are unavailable or have no price';
  end if;

  select sum(p.price * requested.quantity)
    into v_total
  from jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
  join products p on p.id = requested.product_id and p.is_active = true;

  v_order_number := 'PR-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS') || '-' || floor(random() * 900 + 100)::text;

  -- Create or update customer record if authenticated
  if v_user_id is not null then
    insert into customers (user_id, name, email, mobile)
    values (v_user_id, trim(p_customer->>'name'), nullif(trim(p_customer->>'email'), ''), trim(p_customer->>'mobile'))
    on conflict (user_id) do update
    set updated_at = now()
    returning id into v_customer_id;
  end if;

  insert into orders (
    order_number, user_id, customer_name, customer_mobile, customer_email,
    address, city, state, pincode, subtotal, total_amount,
    payment_status, order_status, payment_method
  ) values (
    v_order_number, v_user_id, trim(p_customer->>'name'), trim(p_customer->>'mobile'),
    nullif(trim(p_customer->>'email'), ''), nullif(trim(p_customer->>'address'), ''),
    nullif(trim(p_customer->>'city'), ''), nullif(trim(p_customer->>'state'), ''),
    nullif(trim(p_customer->>'pincode'), ''), v_total, v_total,
    'pending', 'new', 'enquiry'
  ) returning id into v_order_id;

  insert into order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
  select v_order_id, p.id, p.name, requested.quantity, p.price, p.price * requested.quantity
  from jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
  join products p on p.id = requested.product_id and p.is_active = true;

  -- Create initial delivery timeline entry
  insert into delivery_timeline (order_id, status, description)
  values (v_order_id, 'order_placed', 'Your order has been placed successfully');

  return query select v_order_id, v_order_number;
end;
$$;

grant execute on function public.create_website_order(jsonb, jsonb) to anon, authenticated;

-- ============================================================================
-- 15. HELPER FUNCTIONS
-- ============================================================================

-- Function to get order details with all related data
create or replace function public.get_order_details(p_order_id uuid)
returns table (
  order_id uuid,
  order_number text,
  customer_name text,
  customer_email text,
  customer_mobile text,
  total_amount numeric,
  order_status text,
  payment_status text,
  created_at timestamp,
  items jsonb,
  shipment jsonb,
  delivery_timeline jsonb
)
language sql
security definer
as $$
select
  o.id,
  o.order_number,
  o.customer_name,
  o.customer_email,
  o.customer_mobile,
  o.total_amount,
  o.order_status,
  o.payment_status,
  o.created_at,
  coalesce(jsonb_agg(jsonb_build_object('product_name', oi.product_name, 'quantity', oi.quantity, 'unit_price', oi.unit_price, 'total_price', oi.total_price)), '[]'::jsonb) as items,
  jsonb_build_object('tracking_number', s.tracking_number, 'courier_name', s.courier_name, 'status', s.status, 'estimated_delivery_date', s.estimated_delivery_date) as shipment,
  coalesce(jsonb_agg(jsonb_build_object('status', dt.status, 'description', dt.description, 'status_date', dt.status_date)), '[]'::jsonb) as delivery_timeline
from orders o
left join order_items oi on o.id = oi.order_id
left join shipments s on o.id = s.order_id
left join delivery_timeline dt on o.id = dt.order_id
where o.id = p_order_id
group by o.id, o.order_number, o.customer_name, o.customer_email, o.customer_mobile, o.total_amount, o.order_status, o.payment_status, o.created_at, s.tracking_number, s.courier_name, s.status, s.estimated_delivery_date;
$$;

-- Function to generate unique ticket number
create or replace function public.generate_ticket_number()
returns text
language sql
as $$
select 'TKT-' || to_char(now(), 'YYMMDDHH24MISSMS') || '-' || floor(random() * 9000 + 1000)::text;
$$;

-- Trigger to auto-generate service ticket number
create or replace function public.set_ticket_number()
returns trigger
language plpgsql
as $$
begin
  if new.ticket_number is null then
    new.ticket_number := public.generate_ticket_number();
  end if;
  return new;
end;
$$;

create trigger trigger_service_ticket_number
before insert on service_tickets
for each row
execute function set_ticket_number();

-- ============================================================================
-- GRANTS
-- ============================================================================

grant execute on function public.get_order_details(uuid) to authenticated;
grant execute on function public.generate_ticket_number() to authenticated;
