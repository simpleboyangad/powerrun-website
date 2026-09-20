-- ============================================================================
-- PowerRun Industries - Production schema migration (01 / schema)
-- Additive and idempotent. Safe to run more than once.
-- Extends the EXISTING tables (products, categories, orders, order_items,
-- customers, admin_users, leads, warranties, service_tickets) instead of
-- creating duplicates.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. CATEGORIES : self-referencing parent for sub-categories
-- ---------------------------------------------------------------------------
alter table public.categories add column if not exists parent_id uuid
  references public.categories(id) on delete cascade;
alter table public.categories add column if not exists updated_at timestamptz default now();

create index if not exists categories_parent_id_idx on public.categories(parent_id);
create unique index if not exists categories_slug_key on public.categories(slug);

-- ---------------------------------------------------------------------------
-- 2. PRODUCTS : sub-category, features, availability, SEO, ordering
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists subcategory_id uuid
  references public.categories(id) on delete set null;
alter table public.products add column if not exists features jsonb default '[]'::jsonb;
alter table public.products add column if not exists availability text default 'in_stock';
alter table public.products add column if not exists sort_order integer default 0;
alter table public.products add column if not exists meta_title text;
alter table public.products add column if not exists meta_description text;

-- Discount % is derived from MRP vs price so it can never drift out of sync.
do $do$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'discount_percent'
  ) then
    alter table public.products add column discount_percent numeric
      generated always as (
        case
          when mrp is not null and mrp > 0 and price is not null and mrp > price
          then round((1 - (price / mrp)) * 100, 2)
          else 0
        end
      ) stored;
  end if;
end;
$do$;

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_availability_check') then
    alter table public.products add constraint products_availability_check
      check (availability in ('in_stock','out_of_stock','preorder','discontinued'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_stock_check') then
    alter table public.products add constraint products_stock_check check (stock >= 0);
  end if;
end;
$do$;

create index if not exists products_category_id_idx    on public.products(category_id);
create index if not exists products_subcategory_id_idx on public.products(subcategory_id);
create index if not exists products_is_active_idx      on public.products(is_active);
create unique index if not exists products_slug_key on public.products(slug);
create unique index if not exists products_sku_key  on public.products(sku);

-- ---------------------------------------------------------------------------
-- 3. ORDERS : customer link, Razorpay fields, status vocabulary
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists customer_id uuid
  references public.customers(id) on delete set null;
alter table public.orders add column if not exists razorpay_order_id text;
alter table public.orders add column if not exists razorpay_payment_id text;
alter table public.orders add column if not exists razorpay_signature text;
alter table public.orders add column if not exists payment_verified_at timestamptz;
alter table public.orders add column if not exists cancelled_reason text;

-- Normalise any legacy status value before the constraint is applied.
update public.orders set order_status = 'pending'
  where order_status is null or lower(order_status) = 'new';
update public.orders set payment_status = 'pending' where payment_status is null;

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_order_status_check') then
    alter table public.orders add constraint orders_order_status_check
      check (order_status in ('pending','confirmed','processing','shipped','delivered','cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_status_check') then
    alter table public.orders add constraint orders_payment_status_check
      check (payment_status in ('pending','paid','failed','refunded'));
  end if;
end;
$do$;

create index if not exists orders_created_at_idx      on public.orders(created_at desc);
create index if not exists orders_order_status_idx    on public.orders(order_status);
create index if not exists orders_customer_mobile_idx on public.orders(customer_mobile);
create unique index if not exists orders_order_number_key on public.orders(order_number);

-- Human-readable order numbers: PR-2026-00001
create sequence if not exists public.pr_order_number_seq start with 1;

-- ---------------------------------------------------------------------------
-- 4. ORDER ITEMS : keep the SKU as sold
-- ---------------------------------------------------------------------------
alter table public.order_items add column if not exists product_sku text;
create index if not exists order_items_order_id_idx on public.order_items(order_id);

-- ---------------------------------------------------------------------------
-- 5. WARRANTIES : support standalone public registration
--    (the table only supported order-linked warranties before)
-- ---------------------------------------------------------------------------
alter table public.warranties add column if not exists warranty_number text;
alter table public.warranties add column if not exists name text;
alter table public.warranties add column if not exists mobile text;
alter table public.warranties add column if not exists email text;
alter table public.warranties add column if not exists product_name text;
alter table public.warranties add column if not exists purchase_date date;
alter table public.warranties add column if not exists invoice_number text;
alter table public.warranties add column if not exists dealer_name text;
alter table public.warranties add column if not exists address text;
alter table public.warranties add column if not exists city text;
alter table public.warranties add column if not exists state text;
alter table public.warranties add column if not exists pincode text;
alter table public.warranties add column if not exists notes text;
alter table public.warranties add column if not exists updated_at timestamptz default now();

-- A public registration has no order / customer row yet.
do $do$
declare c record;
begin
  for c in select column_name from information_schema.columns
           where table_schema = 'public' and table_name = 'warranties'
             and column_name in ('order_id','order_item_id','product_id','customer_id')
             and is_nullable = 'NO'
  loop
    execute format('alter table public.warranties alter column %I drop not null', c.column_name);
  end loop;
end;
$do$;

create sequence if not exists public.pr_warranty_number_seq start with 1;
create unique index if not exists warranties_warranty_number_key
  on public.warranties(warranty_number) where warranty_number is not null;
create index if not exists warranties_mobile_idx on public.warranties(mobile);

-- ---------------------------------------------------------------------------
-- 6. SERVICE TICKETS : support standalone public requests
-- ---------------------------------------------------------------------------
alter table public.service_tickets add column if not exists name text;
alter table public.service_tickets add column if not exists mobile text;
alter table public.service_tickets add column if not exists email text;
alter table public.service_tickets add column if not exists product_name text;
alter table public.service_tickets add column if not exists issue_type text;
alter table public.service_tickets add column if not exists purchase_date date;
alter table public.service_tickets add column if not exists attachment_url text;
alter table public.service_tickets add column if not exists address text;
alter table public.service_tickets add column if not exists city text;
alter table public.service_tickets add column if not exists state text;
alter table public.service_tickets add column if not exists pincode text;
alter table public.service_tickets add column if not exists resolution_notes text;
alter table public.service_tickets add column if not exists updated_at timestamptz default now();

do $do$
declare c record;
begin
  for c in select column_name from information_schema.columns
           where table_schema = 'public' and table_name = 'service_tickets'
             and column_name in ('order_id','product_id','customer_id','user_id')
             and is_nullable = 'NO'
  loop
    execute format('alter table public.service_tickets alter column %I drop not null', c.column_name);
  end loop;
end;
$do$;

create sequence if not exists public.pr_ticket_number_seq start with 1;
create unique index if not exists service_tickets_ticket_number_key
  on public.service_tickets(ticket_number) where ticket_number is not null;
create index if not exists service_tickets_mobile_idx on public.service_tickets(mobile);

-- Normalise the status vocabulary on warranties and service tickets. Any
-- pre-existing CHECK constraint on those columns is dropped first, because the
-- public registration/request flows introduce new values.
do $do$
declare c record;
begin
  for c in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname in ('warranties','service_tickets')
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.%I drop constraint %I', c.relname, c.conname);
  end loop;
end;
$do$;

update public.warranties
   set status = 'pending'
 where status is null or status not in ('pending','approved','rejected','expired');

update public.service_tickets
   set status = 'open'
 where status is null or status not in ('open','in_progress','resolved','closed','cancelled');

update public.service_tickets
   set priority = 'normal'
 where priority is null or priority not in ('low','normal','high','urgent');

alter table public.warranties
  add constraint warranties_status_check
  check (status in ('pending','approved','rejected','expired'));

alter table public.service_tickets
  add constraint service_tickets_status_check
  check (status in ('open','in_progress','resolved','closed','cancelled'));

alter table public.service_tickets
  add constraint service_tickets_priority_check
  check (priority in ('low','normal','high','urgent'));

-- ---------------------------------------------------------------------------
-- 7. DEALER ENQUIRIES : new table
-- ---------------------------------------------------------------------------
create table if not exists public.dealer_enquiries (
  id             uuid primary key default gen_random_uuid(),
  enquiry_number text,
  name           text not null,
  company_name   text,
  mobile         text not null,
  email          text,
  city           text,
  state          text,
  business_type  text,
  message        text,
  status         text not null default 'new',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'dealer_enquiries_status_check') then
    alter table public.dealer_enquiries add constraint dealer_enquiries_status_check
      check (status in ('new','contacted','qualified','approved','rejected','closed'));
  end if;
end;
$do$;

create sequence if not exists public.pr_dealer_number_seq start with 1;
create unique index if not exists dealer_enquiries_number_key
  on public.dealer_enquiries(enquiry_number) where enquiry_number is not null;
create index if not exists dealer_enquiries_created_at_idx on public.dealer_enquiries(created_at desc);

-- ---------------------------------------------------------------------------
-- 8. ADMIN USERS
-- ---------------------------------------------------------------------------
alter table public.admin_users add column if not exists updated_at timestamptz default now();
create unique index if not exists admin_users_user_id_key on public.admin_users(user_id);

-- ---------------------------------------------------------------------------
-- 9. SITE SETTINGS (shipping charge, free-shipping threshold, payment toggle)
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.site_settings(key, value) values
  ('shipping', '{"flat_rate": 0, "free_above": 0}'::jsonb),
  ('payments', '{"razorpay_enabled": false, "cod_enabled": true}'::jsonb),
  ('store',    '{"name": "PowerRun Industries", "whatsapp": "918700307676", "email": "service@powerrun.in", "phone": "+91 87003 07676"}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 10. updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

do $do$
declare t text;
begin
  foreach t in array array[
    'products','categories','orders','customers','leads',
    'warranties','service_tickets','dealer_enquiries','admin_users','site_settings'
  ] loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = t and column_name = 'updated_at') then
      execute format('drop trigger if exists set_updated_at on public.%I', t);
      execute format(
        'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
    end if;
  end loop;
end;
$do$;

-- ============================================================================
-- PowerRun Industries - Production schema migration (02 / functions)
-- All writes from the public website go through SECURITY DEFINER functions so
-- that anon holds NO table-level write grants anywhere.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Admin check. SECURITY DEFINER so it bypasses RLS on admin_users and can
-- therefore be used inside admin_users' own policies without recursion.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
      and coalesce(is_active, true) = true
  );
$fn$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.pr_next_number(p_seq text, p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
begin
  return p_prefix || '-' || to_char(now(), 'YYYY') || '-'
         || lpad(nextval(p_seq::regclass)::text, 5, '0');
end;
$fn$;

create or replace function public.pr_valid_mobile(p text)
returns boolean
language sql
immutable
as $fn$
  select p ~ '^[6-9][0-9]{9}$';
$fn$;

-- ---------------------------------------------------------------------------
-- ORDER PLACEMENT
-- Replaces the old two-argument version. Prices, totals and shipping are all
-- recomputed from the database; nothing the browser sends is trusted.
-- ---------------------------------------------------------------------------
drop function if exists public.create_website_order(jsonb, jsonb);
drop function if exists public.create_website_order(jsonb, jsonb, text);

create function public.create_website_order(
  p_customer       jsonb,
  p_items          jsonb,
  p_payment_method text default 'cod'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order_id     uuid;
  v_order_number text;
  v_customer_id  uuid;
  v_user_id      uuid := auth.uid();
  v_name         text := nullif(trim(p_customer->>'name'), '');
  v_mobile       text := nullif(trim(p_customer->>'mobile'), '');
  v_email        text := nullif(trim(p_customer->>'email'), '');
  v_address      text := nullif(trim(p_customer->>'address'), '');
  v_city         text := nullif(trim(p_customer->>'city'), '');
  v_state        text := nullif(trim(p_customer->>'state'), '');
  v_pincode      text := nullif(trim(p_customer->>'pincode'), '');
  v_subtotal     numeric := 0;
  v_shipping     numeric := 0;
  v_total        numeric := 0;
  v_ship_cfg     jsonb;
  v_lines        jsonb;
  v_bad          text;
begin
  -- ---- 1. customer validation -------------------------------------------
  if v_name is null then raise exception 'Full name is required' using errcode = 'P0001'; end if;
  if v_mobile is null or not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit Indian mobile number is required' using errcode = 'P0001';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Email address is not valid' using errcode = 'P0001';
  end if;
  if v_address is null then raise exception 'Delivery address is required' using errcode = 'P0001'; end if;
  if v_city   is null then raise exception 'City is required' using errcode = 'P0001'; end if;
  if v_state  is null then raise exception 'State is required' using errcode = 'P0001'; end if;
  if v_pincode is null or v_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'A valid 6-digit pincode is required' using errcode = 'P0001';
  end if;

  if coalesce(p_payment_method, 'cod') not in ('cod','razorpay') then
    raise exception 'Unsupported payment method' using errcode = 'P0001';
  end if;

  -- ---- 2. cart validation ------------------------------------------------
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as r(product_id uuid, quantity integer)
    where r.product_id is null or r.quantity is null or r.quantity < 1
  ) then
    raise exception 'Cart contains an invalid line item' using errcode = 'P0001';
  end if;

  -- Collapse duplicate lines for the same product into one canonical array.
  select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'quantity', qty)), '[]'::jsonb)
    into v_lines
  from (
    select r.product_id, sum(r.quantity)::int as qty
    from jsonb_to_recordset(p_items) as r(product_id uuid, quantity integer)
    group by r.product_id
  ) grouped;

  -- ---- 3. availability ---------------------------------------------------
  if exists (
    select 1 from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
    left join products p on p.id = l.product_id and p.is_active is true
    where p.id is null
  ) then
    raise exception 'A product in your cart is no longer available' using errcode = 'P0001';
  end if;

  select p.name into v_bad
  from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
  join products p on p.id = l.product_id
  where p.price is null or p.price <= 0 limit 1;
  if v_bad is not null then
    raise exception 'No price is set for "%". Please contact us for a quote.', v_bad using errcode = 'P0001';
  end if;

  select p.name into v_bad
  from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
  join products p on p.id = l.product_id
  where p.availability in ('out_of_stock','discontinued') limit 1;
  if v_bad is not null then
    raise exception '"%" is currently unavailable', v_bad using errcode = 'P0001';
  end if;

  select p.name into v_bad
  from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
  join products p on p.id = l.product_id
  where p.availability = 'in_stock' and coalesce(p.stock, 0) < l.quantity limit 1;
  if v_bad is not null then
    raise exception 'Not enough stock for "%"', v_bad using errcode = 'P0001';
  end if;

  -- ---- 4. server-side totals --------------------------------------------
  select coalesce(sum(p.price * l.quantity), 0) into v_subtotal
  from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
  join products p on p.id = l.product_id;

  select value into v_ship_cfg from site_settings where key = 'shipping';
  v_shipping := coalesce((v_ship_cfg->>'flat_rate')::numeric, 0);
  if coalesce((v_ship_cfg->>'free_above')::numeric, 0) > 0
     and v_subtotal >= (v_ship_cfg->>'free_above')::numeric then
    v_shipping := 0;
  end if;
  v_total := v_subtotal + v_shipping;

  -- ---- 5. customer record ------------------------------------------------
  if v_user_id is not null then
    select id into v_customer_id from customers where user_id = v_user_id;
  end if;
  if v_customer_id is null then
    select id into v_customer_id from customers where mobile = v_mobile order by created_at limit 1;
  end if;
  if v_customer_id is null then
    insert into customers (user_id, name, email, mobile, total_orders, total_spent)
    values (v_user_id, v_name, v_email, v_mobile, 0, 0)
    returning id into v_customer_id;
  end if;

  -- ---- 6. order ----------------------------------------------------------
  v_order_number := public.pr_next_number('public.pr_order_number_seq', 'PR');

  insert into orders (
    order_number, user_id, customer_id,
    customer_name, customer_mobile, customer_email,
    address, city, state, pincode,
    subtotal, shipping_cost, gst_amount, discount_amount, total_amount,
    order_status, payment_status, payment_method
  ) values (
    v_order_number, v_user_id, v_customer_id,
    v_name, v_mobile, v_email,
    v_address, v_city, v_state, v_pincode,
    v_subtotal, v_shipping, 0, 0, v_total,
    'pending', 'pending', coalesce(p_payment_method, 'cod')
  ) returning id into v_order_id;

  insert into order_items (order_id, product_id, product_name, product_sku, quantity, unit_price, total_price)
  select v_order_id, p.id, p.name, p.sku, l.quantity, p.price, p.price * l.quantity
  from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
  join products p on p.id = l.product_id;

  -- ---- 7. stock ----------------------------------------------------------
  update products p
     set stock = greatest(coalesce(p.stock, 0) - l.quantity, 0)
    from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
   where p.id = l.product_id and p.availability = 'in_stock';

  update products
     set availability = 'out_of_stock'
   where id in (select l.product_id from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer))
     and availability = 'in_stock'
     and coalesce(stock, 0) = 0;

  update customers
     set total_orders = coalesce(total_orders, 0) + 1,
         total_spent  = coalesce(total_spent, 0) + v_total
   where id = v_customer_id;

  return jsonb_build_object(
    'order_id',     v_order_id,
    'order_number', v_order_number,
    'subtotal',     v_subtotal,
    'shipping',     v_shipping,
    'total_amount', v_total
  );
end;
$fn$;

revoke execute on function public.create_website_order(jsonb, jsonb, text) from public;
grant execute on function public.create_website_order(jsonb, jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ORDER LOOK-UP for the confirmation page and public tracking.
-- Requires order number AND the mobile it was placed with.
-- ---------------------------------------------------------------------------
drop function if exists public.track_order_public(text, text);

create or replace function public.get_order_public(p_order_number text, p_mobile text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order  orders%rowtype;
  v_items  jsonb;
begin
  if coalesce(trim(p_order_number), '') = '' or coalesce(trim(p_mobile), '') = '' then
    raise exception 'Order number and mobile number are both required' using errcode = 'P0001';
  end if;

  select * into v_order from orders
  where upper(order_number) = upper(trim(p_order_number))
    and customer_mobile = trim(p_mobile);

  if not found then
    raise exception 'No order found for that order number and mobile number' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_name', oi.product_name,
           'product_sku',  oi.product_sku,
           'quantity',     oi.quantity,
           'unit_price',   oi.unit_price,
           'total_price',  oi.total_price
         ) order by oi.created_at), '[]'::jsonb)
    into v_items
  from order_items oi where oi.order_id = v_order.id;

  return jsonb_build_object(
    'order_number',    v_order.order_number,
    'customer_name',   v_order.customer_name,
    'customer_mobile', v_order.customer_mobile,
    'customer_email',  v_order.customer_email,
    'address',         v_order.address,
    'city',            v_order.city,
    'state',           v_order.state,
    'pincode',         v_order.pincode,
    'subtotal',        v_order.subtotal,
    'shipping_cost',   v_order.shipping_cost,
    'total_amount',    v_order.total_amount,
    'order_status',    v_order.order_status,
    'payment_status',  v_order.payment_status,
    'payment_method',  v_order.payment_method,
    'tracking_number', v_order.tracking_number,
    'courier_partner', v_order.courier_partner,
    'created_at',      v_order.created_at,
    'items',           v_items
  );
end;
$fn$;

revoke execute on function public.get_order_public(text, text) from public;
grant execute on function public.get_order_public(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- PUBLIC FORM SUBMISSIONS
-- ---------------------------------------------------------------------------
create or replace function public.submit_warranty_registration(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id     uuid;
  v_number text;
  v_mobile text := nullif(trim(p_data->>'mobile'), '');
  v_name   text := nullif(trim(p_data->>'name'), '');
  v_serial text := nullif(trim(p_data->>'serial_number'), '');
begin
  if v_name is null then raise exception 'Name is required' using errcode = 'P0001'; end if;
  if v_mobile is null or not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;
  if v_serial is null then raise exception 'Product serial number is required' using errcode = 'P0001'; end if;

  v_number := public.pr_next_number('public.pr_warranty_number_seq', 'PRW');

  insert into warranties (
    warranty_number, name, mobile, email, product_id, product_name,
    serial_number, purchase_date, invoice_number, dealer_name,
    address, city, state, pincode, status
  ) values (
    v_number, v_name, v_mobile, nullif(trim(p_data->>'email'), ''),
    nullif(p_data->>'product_id', '')::uuid, nullif(trim(p_data->>'product_name'), ''),
    v_serial,
    nullif(p_data->>'purchase_date', '')::date,
    nullif(trim(p_data->>'invoice_number'), ''),
    nullif(trim(p_data->>'dealer_name'), ''),
    nullif(trim(p_data->>'address'), ''),
    nullif(trim(p_data->>'city'), ''),
    nullif(trim(p_data->>'state'), ''),
    nullif(trim(p_data->>'pincode'), ''),
    'pending'
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'warranty_number', v_number);
end;
$fn$;

create or replace function public.submit_service_request(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id     uuid;
  v_number text;
  v_mobile text := nullif(trim(p_data->>'mobile'), '');
  v_name   text := nullif(trim(p_data->>'name'), '');
  v_issue  text := nullif(trim(p_data->>'issue_description'), '');
begin
  if v_name is null then raise exception 'Name is required' using errcode = 'P0001'; end if;
  if v_mobile is null or not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;
  if v_issue is null then raise exception 'Please describe the issue' using errcode = 'P0001'; end if;

  v_number := public.pr_next_number('public.pr_ticket_number_seq', 'PRS');

  insert into service_tickets (
    ticket_number, name, mobile, email, product_id, product_name,
    serial_number, issue_type, issue_description, purchase_date,
    attachment_url, address, city, state, pincode, status, priority
  ) values (
    v_number, v_name, v_mobile, nullif(trim(p_data->>'email'), ''),
    nullif(p_data->>'product_id', '')::uuid, nullif(trim(p_data->>'product_name'), ''),
    nullif(trim(p_data->>'serial_number'), ''),
    nullif(trim(p_data->>'issue_type'), ''),
    v_issue,
    nullif(p_data->>'purchase_date', '')::date,
    nullif(trim(p_data->>'attachment_url'), ''),
    nullif(trim(p_data->>'address'), ''),
    nullif(trim(p_data->>'city'), ''),
    nullif(trim(p_data->>'state'), ''),
    nullif(trim(p_data->>'pincode'), ''),
    'open', 'normal'
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'ticket_number', v_number);
end;
$fn$;

create or replace function public.submit_dealer_enquiry(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id     uuid;
  v_number text;
  v_mobile text := nullif(trim(p_data->>'mobile'), '');
  v_name   text := nullif(trim(p_data->>'name'), '');
begin
  if v_name is null then raise exception 'Name is required' using errcode = 'P0001'; end if;
  if v_mobile is null or not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;

  v_number := public.pr_next_number('public.pr_dealer_number_seq', 'PRD');

  insert into dealer_enquiries (
    enquiry_number, name, company_name, mobile, email,
    city, state, business_type, message, status
  ) values (
    v_number, v_name, nullif(trim(p_data->>'company_name'), ''), v_mobile,
    nullif(trim(p_data->>'email'), ''),
    nullif(trim(p_data->>'city'), ''),
    nullif(trim(p_data->>'state'), ''),
    nullif(trim(p_data->>'business_type'), ''),
    nullif(trim(p_data->>'message'), ''),
    'new'
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'enquiry_number', v_number);
end;
$fn$;

create or replace function public.submit_contact_lead(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id     uuid;
  v_mobile text := nullif(trim(p_data->>'mobile'), '');
  v_name   text := nullif(trim(p_data->>'name'), '');
begin
  if v_name is null then raise exception 'Name is required' using errcode = 'P0001'; end if;
  if v_mobile is null or not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;

  insert into leads (product_id, name, mobile, email, city, message, source, status)
  values (
    nullif(p_data->>'product_id', '')::uuid, v_name, v_mobile,
    nullif(trim(p_data->>'email'), ''),
    nullif(trim(p_data->>'city'), ''),
    nullif(trim(p_data->>'message'), ''),
    coalesce(nullif(trim(p_data->>'source'), ''), 'website'),
    'new'
  ) returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$fn$;

do $do$
declare f text;
begin
  foreach f in array array[
    'submit_warranty_registration','submit_service_request',
    'submit_dealer_enquiry','submit_contact_lead'
  ] loop
    execute format('revoke execute on function public.%I(jsonb) from public', f);
    execute format('grant execute on function public.%I(jsonb) to anon, authenticated', f);
  end loop;
end;
$do$;

-- ---------------------------------------------------------------------------
-- ADMIN DASHBOARD COUNTS (one round trip, admin only)
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'total_products',    (select count(*) from products),
    'active_products',   (select count(*) from products where is_active),
    'total_orders',      (select count(*) from orders),
    'pending_orders',    (select count(*) from orders where order_status = 'pending'),
    'processing_orders', (select count(*) from orders where order_status = 'processing'),
    'confirmed_orders',  (select count(*) from orders where order_status = 'confirmed'),
    'shipped_orders',    (select count(*) from orders where order_status = 'shipped'),
    'completed_orders',  (select count(*) from orders where order_status = 'delivered'),
    'cancelled_orders',  (select count(*) from orders where order_status = 'cancelled'),
    'total_customers',   (select count(*) from customers),
    'warranty_requests', (select count(*) from warranties),
    'warranty_pending',  (select count(*) from warranties where status = 'pending'),
    'service_requests',  (select count(*) from service_tickets),
    'service_open',      (select count(*) from service_tickets where status = 'open'),
    'dealer_enquiries',  (select count(*) from dealer_enquiries),
    'dealer_new',        (select count(*) from dealer_enquiries where status = 'new'),
    'leads',             (select count(*) from leads),
    'revenue_paid',      (select coalesce(sum(total_amount), 0) from orders where payment_status = 'paid'),
    'revenue_total',     (select coalesce(sum(total_amount), 0) from orders where order_status <> 'cancelled'),
    'low_stock',         (select count(*) from products where is_active and coalesce(stock, 0) <= 5)
  );
end;
$fn$;

revoke execute on function public.admin_dashboard_stats() from public;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- Restock when an order is cancelled (admin action).
-- ---------------------------------------------------------------------------
create or replace function public.restock_cancelled_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.order_status = 'cancelled' and coalesce(old.order_status, '') <> 'cancelled' then
    update products p
       set stock = coalesce(p.stock, 0) + oi.quantity,
           availability = case when p.availability = 'out_of_stock' then 'in_stock' else p.availability end
      from order_items oi
     where oi.order_id = new.id and p.id = oi.product_id;
  end if;
  return new;
end;
$fn$;

drop trigger if exists restock_on_cancel on public.orders;
create trigger restock_on_cancel
  after update of order_status on public.orders
  for each row execute function public.restock_cancelled_order();

-- ============================================================================
-- PowerRun Industries - Production schema migration (03 / RLS)
--
-- Every existing policy on these tables is dropped first, so that any legacy
-- permissive "allow all" policy cannot survive this migration. The canonical
-- set below is then recreated.
--
-- Rules enforced here:
--   * anon may READ active products / categories / product images only.
--   * anon has NO table-level write grant anywhere. Public writes (orders,
--     warranty, service, dealer, contact) go through SECURITY DEFINER RPCs.
--   * a signed-in customer may read ONLY their own orders and order items.
--   * everything else is admin-only, verified by public.is_admin() against the
--     admin_users table -- never by anything the browser can set.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS and clear legacy policies
-- ---------------------------------------------------------------------------
do $do$
declare
  t text;
  p record;
  tables text[] := array[
    'products','categories','product_images','orders','order_items','customers',
    'customer_addresses','admin_users','leads','warranties','service_tickets',
    'dealer_enquiries','site_settings','shipments','delivery_timeline',
    'invoices','notifications','contact_messages'
  ];
begin
  foreach t in array tables loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      -- NOTE: deliberately ENABLE but never FORCE. Forcing would also subject
      -- the table owner to these policies, which would break the SECURITY
      -- DEFINER submit_*/create_website_order functions that insert here.
      execute format('alter table public.%I enable row level security', t);
      execute format('alter table public.%I no force row level security', t);
      for p in select policyname from pg_policies
               where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', p.policyname, t);
      end loop;
    end if;
  end loop;
end;
$do$;

-- Revoke any direct table grants anon may have picked up along the way.
revoke all on all tables in schema public from anon;
grant select on public.products, public.categories, public.product_images,
                public.site_settings to anon;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on
  public.products, public.categories, public.product_images, public.orders,
  public.order_items, public.customers, public.leads, public.warranties,
  public.service_tickets, public.dealer_enquiries, public.site_settings,
  public.admin_users
to authenticated;

-- ---------------------------------------------------------------------------
-- CATALOGUE : public read of active rows, admin full control
-- ---------------------------------------------------------------------------
create policy categories_public_read on public.categories
  for select to anon, authenticated
  using (is_active is true or public.is_admin());

create policy categories_admin_write on public.categories
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy products_public_read on public.products
  for select to anon, authenticated
  using (is_active is true or public.is_admin());

create policy products_admin_write on public.products
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy product_images_public_read on public.product_images
  for select to anon, authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.products p
               where p.id = product_images.product_id and p.is_active is true)
  );

create policy product_images_admin_write on public.product_images
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- ORDERS : never readable by anon. Signed-in customers see only their own.
-- Public order placement happens through create_website_order() only.
-- ---------------------------------------------------------------------------
create policy orders_owner_read on public.orders
  for select to authenticated
  using (public.is_admin() or (user_id is not null and user_id = auth.uid()));

create policy orders_admin_write on public.orders
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy order_items_owner_read on public.order_items
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.orders o
               where o.id = order_items.order_id
                 and o.user_id is not null and o.user_id = auth.uid())
  );

create policy order_items_admin_write on public.order_items
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------------------------
create policy customers_owner_read on public.customers
  for select to authenticated
  using (public.is_admin() or (user_id is not null and user_id = auth.uid()));

create policy customers_admin_write on public.customers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- ADMIN USERS : a signed-in user may read only their own row (that is how the
-- admin panel confirms the session). Only an admin may change the table.
-- is_admin() is SECURITY DEFINER, so no policy recursion occurs here.
-- ---------------------------------------------------------------------------
create policy admin_users_self_read on public.admin_users
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy admin_users_admin_write on public.admin_users
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- ENQUIRY / SUPPORT TABLES : admin-only from the client side.
-- Customers write to them exclusively via the submit_* RPCs.
-- ---------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array['leads','warranties','service_tickets','dealer_enquiries'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin())',
      t || '_admin_read', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_write', t);
  end loop;
end;
$do$;

-- ---------------------------------------------------------------------------
-- SITE SETTINGS : readable by everyone (shipping rates shown at checkout),
-- writable by admins only.
-- ---------------------------------------------------------------------------
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated using (true);

create policy site_settings_admin_write on public.site_settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- FULFILMENT TABLES : admin-only, plus the owning customer where applicable.
-- ---------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array['customer_addresses','shipments','delivery_timeline','invoices','notifications','contact_messages'] loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
        t || '_admin_all', t);

      if exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = t and column_name = 'user_id') then
        execute format(
          'create policy %I on public.%I for select to authenticated using (user_id is not null and user_id = auth.uid())',
          t || '_owner_read', t);
      elsif exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t and column_name = 'order_id') then
        execute format(
          'create policy %I on public.%I for select to authenticated using (exists (select 1 from public.orders o where o.id = %I.order_id and o.user_id is not null and o.user_id = auth.uid()))',
          t || '_owner_read', t, t);
      end if;
    end if;
  end loop;
end;
$do$;

-- ============================================================================
-- PowerRun Industries - Production schema migration (04 / catalogue seed)
--
-- IMPORTANT: these prices, MRPs and stock levels are PLACEHOLDERS derived from
-- the price list that was already hard-coded in the website's PR_SEED array.
-- Review and correct every one of them in Admin > Products before going live.
--
-- Matching is by SKU, so running this again simply refreshes the same 25 rows.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Sub-categories (children of the existing top-level categories)
-- ---------------------------------------------------------------------------
insert into public.categories (name, slug, description, parent_id, sort_order, is_active)
select v.name, v.slug, v.description, parent.id, v.sort_order, true
from (values
  ('Residential Hybrid Inverters','residential-hybrid-inverters','Hybrid inverters for homes and small offices','Hybrid Inverters',1),
  ('Commercial Hybrid Inverters','commercial-hybrid-inverters','Higher capacity hybrid inverters for commercial loads','Hybrid Inverters',2),
  ('24V LFP Batteries','24v-lfp-batteries','25.6V LiFePO4 battery packs','Lithium Batteries',1),
  ('48V LFP Batteries','48v-lfp-batteries','51.2V LiFePO4 battery packs','Lithium Batteries',2),
  ('Mono PERC Panels','mono-perc-panels','High efficiency mono PERC solar modules','Solar Panels',1),
  ('Bifacial Panels','bifacial-panels','Bifacial high output solar modules','Solar Panels',2),
  ('48V E-Rickshaw Batteries','48v-e-rickshaw-batteries','48V and 51.2V e-rickshaw packs','E-Rickshaw Batteries',1),
  ('72V E-Rickshaw Batteries','72v-e-rickshaw-batteries','72V e-rickshaw packs','E-Rickshaw Batteries',2)
) as v(name, slug, description, parent_name, sort_order)
join public.categories parent on parent.name = v.parent_name and parent.parent_id is null
on conflict (slug) do update
  set name        = excluded.name,
      description = excluded.description,
      parent_id   = excluded.parent_id,
      sort_order  = excluded.sort_order,
      is_active   = true;

-- ---------------------------------------------------------------------------
-- 2. Product pricing, stock, warranty, features, specifications, SEO
-- ---------------------------------------------------------------------------
update public.products p
   set price             = v.price,
       mrp               = v.mrp,
       compare_price     = v.mrp,
       stock             = v.stock,
       availability      = 'in_stock',
       warranty          = v.warranty,
       features          = v.features::jsonb,
       specifications    = v.specifications::jsonb,
       short_description = v.short_description,
       meta_title        = v.meta_title,
       meta_description  = v.meta_description,
       sort_order        = v.sort_order,
       is_active         = true,
       subcategory_id    = sub.id
from (values
  ('PR-001', 180000, 212500, 25, '2 Years Comprehensive Warranty', '["Pure sine wave output", "Built-in MPPT solar charge controller", "Seamless grid / solar / battery switching", "LCD and app monitoring", "Overload and short-circuit protection"]', '{"Rated Power": "3.6 kW", "Output Waveform": "Pure Sine Wave", "System Voltage": "48 V DC", "Solar Charge Controller": "MPPT", "Max PV Input": "4.7 kW", "Output Voltage": "230 V AC, 50 Hz", "Efficiency": "Up to 97%", "Communication": "Wi-Fi / RS485"}', 'Residential Hybrid Inverters', 'Grid-interactive hybrid inverter with built-in MPPT for homes and businesses.', 'PR Hybrid Inverter 3.6kW | PowerRun Industries', 'Buy PR Hybrid Inverter 3.6kW from PowerRun Industries. Grid-interactive hybrid inverter with built-in MPPT for homes and businesses. 2 Years Comprehensive Warranty. Pan-India delivery.', 1),
  ('PR-002', 200000, 236000, 25, '2 Years Comprehensive Warranty', '["Pure sine wave output", "Built-in MPPT solar charge controller", "Seamless grid / solar / battery switching", "LCD and app monitoring", "Overload and short-circuit protection"]', '{"Rated Power": "4.2 kW", "Output Waveform": "Pure Sine Wave", "System Voltage": "48 V DC", "Solar Charge Controller": "MPPT", "Max PV Input": "5.5 kW", "Output Voltage": "230 V AC, 50 Hz", "Efficiency": "Up to 97%", "Communication": "Wi-Fi / RS485"}', 'Residential Hybrid Inverters', 'Grid-interactive hybrid inverter with built-in MPPT for homes and businesses.', 'PR Hybrid Inverter 4.2kW | PowerRun Industries', 'Buy PR Hybrid Inverter 4.2kW from PowerRun Industries. Grid-interactive hybrid inverter with built-in MPPT for homes and businesses. 2 Years Comprehensive Warranty. Pan-India delivery.', 2),
  ('PR-003', 250000, 295000, 25, '2 Years Comprehensive Warranty', '["Pure sine wave output", "Built-in MPPT solar charge controller", "Seamless grid / solar / battery switching", "LCD and app monitoring", "Overload and short-circuit protection"]', '{"Rated Power": "6.2 kW", "Output Waveform": "Pure Sine Wave", "System Voltage": "48 V DC", "Solar Charge Controller": "MPPT", "Max PV Input": "8.1 kW", "Output Voltage": "230 V AC, 50 Hz", "Efficiency": "Up to 97%", "Communication": "Wi-Fi / RS485"}', 'Residential Hybrid Inverters', 'Grid-interactive hybrid inverter with built-in MPPT for homes and businesses.', 'PR Hybrid Inverter 6.2kW | PowerRun Industries', 'Buy PR Hybrid Inverter 6.2kW from PowerRun Industries. Grid-interactive hybrid inverter with built-in MPPT for homes and businesses. 2 Years Comprehensive Warranty. Pan-India delivery.', 3),
  ('PR-004', 280000, 330500, 25, '2 Years Comprehensive Warranty', '["Pure sine wave output", "Built-in MPPT solar charge controller", "Seamless grid / solar / battery switching", "LCD and app monitoring", "Overload and short-circuit protection"]', '{"Rated Power": "8.2 kW", "Output Waveform": "Pure Sine Wave", "System Voltage": "48 V DC", "Solar Charge Controller": "MPPT", "Max PV Input": "10.7 kW", "Output Voltage": "230 V AC, 50 Hz", "Efficiency": "Up to 97%", "Communication": "Wi-Fi / RS485"}', 'Commercial Hybrid Inverters', 'Grid-interactive hybrid inverter with built-in MPPT for homes and businesses.', 'PR Hybrid Inverter 8.2kW | PowerRun Industries', 'Buy PR Hybrid Inverter 8.2kW from PowerRun Industries. Grid-interactive hybrid inverter with built-in MPPT for homes and businesses. 2 Years Comprehensive Warranty. Pan-India delivery.', 4),
  ('PR-005', 320000, 377500, 25, '2 Years Comprehensive Warranty', '["Pure sine wave output", "Built-in MPPT solar charge controller", "Seamless grid / solar / battery switching", "LCD and app monitoring", "Overload and short-circuit protection"]', '{"Rated Power": "10.2 kW", "Output Waveform": "Pure Sine Wave", "System Voltage": "48 V DC", "Solar Charge Controller": "MPPT", "Max PV Input": "13.3 kW", "Output Voltage": "230 V AC, 50 Hz", "Efficiency": "Up to 97%", "Communication": "Wi-Fi / RS485"}', 'Commercial Hybrid Inverters', 'Grid-interactive hybrid inverter with built-in MPPT for homes and businesses.', 'PR Hybrid Inverter 10.2kW | PowerRun Industries', 'Buy PR Hybrid Inverter 10.2kW from PowerRun Industries. Grid-interactive hybrid inverter with built-in MPPT for homes and businesses. 2 Years Comprehensive Warranty. Pan-India delivery.', 5),
  ('PR-006', 350000, 413000, 25, '2 Years Comprehensive Warranty', '["Pure sine wave output", "Built-in MPPT solar charge controller", "Seamless grid / solar / battery switching", "LCD and app monitoring", "Overload and short-circuit protection"]', '{"Rated Power": "12.0 kW", "Output Waveform": "Pure Sine Wave", "System Voltage": "48 V DC", "Solar Charge Controller": "MPPT", "Max PV Input": "15.6 kW", "Output Voltage": "230 V AC, 50 Hz", "Efficiency": "Up to 97%", "Communication": "Wi-Fi / RS485"}', 'Commercial Hybrid Inverters', 'Grid-interactive hybrid inverter with built-in MPPT for homes and businesses.', 'PR Hybrid Inverter 12kW | PowerRun Industries', 'Buy PR Hybrid Inverter 12kW from PowerRun Industries. Grid-interactive hybrid inverter with built-in MPPT for homes and businesses. 2 Years Comprehensive Warranty. Pan-India delivery.', 6),
  ('PR-007', 120000, 141500, 25, '5 Years Warranty', '["LiFePO4 (LFP) cell chemistry", "Integrated Smart BMS", "6000+ cycle life", "Bluetooth / RS485 monitoring", "Deep discharge and over-charge protection"]', '{"Chemistry": "LiFePO4", "Nominal Voltage": "25.6 V", "Capacity": "100 Ah", "Energy": "2.56 kWh", "Cycle Life": "6000+ cycles at 80% DoD", "BMS": "Integrated Smart BMS", "Operating Temperature": "-10 C to 55 C", "Protection": "Over-charge / over-discharge / short circuit"}', '24V LFP Batteries', 'LiFePO4 energy storage with integrated smart BMS and long cycle life.', 'PR LFP Battery 25.6V 100Ah | PowerRun Industries', 'Buy PR LFP Battery 25.6V 100Ah from PowerRun Industries. LiFePO4 energy storage with integrated smart BMS and long cycle life. 5 Years Warranty. Pan-India delivery.', 7),
  ('PR-008', 180000, 212500, 25, '5 Years Warranty', '["LiFePO4 (LFP) cell chemistry", "Integrated Smart BMS", "6000+ cycle life", "Bluetooth / RS485 monitoring", "Deep discharge and over-charge protection"]', '{"Chemistry": "LiFePO4", "Nominal Voltage": "25.6 V", "Capacity": "200 Ah", "Energy": "5.12 kWh", "Cycle Life": "6000+ cycles at 80% DoD", "BMS": "Integrated Smart BMS", "Operating Temperature": "-10 C to 55 C", "Protection": "Over-charge / over-discharge / short circuit"}', '24V LFP Batteries', 'LiFePO4 energy storage with integrated smart BMS and long cycle life.', 'PR LFP Battery 25.6V 200Ah | PowerRun Industries', 'Buy PR LFP Battery 25.6V 200Ah from PowerRun Industries. LiFePO4 energy storage with integrated smart BMS and long cycle life. 5 Years Warranty. Pan-India delivery.', 8),
  ('PR-009', 220000, 259500, 25, '5 Years Warranty', '["LiFePO4 (LFP) cell chemistry", "Integrated Smart BMS", "6000+ cycle life", "Bluetooth / RS485 monitoring", "Deep discharge and over-charge protection"]', '{"Chemistry": "LiFePO4", "Nominal Voltage": "25.6 V", "Capacity": "280 Ah", "Energy": "7.17 kWh", "Cycle Life": "6000+ cycles at 80% DoD", "BMS": "Integrated Smart BMS", "Operating Temperature": "-10 C to 55 C", "Protection": "Over-charge / over-discharge / short circuit"}', '24V LFP Batteries', 'LiFePO4 energy storage with integrated smart BMS and long cycle life.', 'PR LFP Battery 25.6V 280Ah | PowerRun Industries', 'Buy PR LFP Battery 25.6V 280Ah from PowerRun Industries. LiFePO4 energy storage with integrated smart BMS and long cycle life. 5 Years Warranty. Pan-India delivery.', 9),
  ('PR-010', 280000, 330500, 25, '5 Years Warranty', '["LiFePO4 (LFP) cell chemistry", "Integrated Smart BMS", "6000+ cycle life", "Bluetooth / RS485 monitoring", "Deep discharge and over-charge protection"]', '{"Chemistry": "LiFePO4", "Nominal Voltage": "25.6 V", "Capacity": "550 Ah", "Energy": "14.08 kWh", "Cycle Life": "6000+ cycles at 80% DoD", "BMS": "Integrated Smart BMS", "Operating Temperature": "-10 C to 55 C", "Protection": "Over-charge / over-discharge / short circuit"}', '24V LFP Batteries', 'LiFePO4 energy storage with integrated smart BMS and long cycle life.', 'PR LFP Battery 25.6V 550Ah | PowerRun Industries', 'Buy PR LFP Battery 25.6V 550Ah from PowerRun Industries. LiFePO4 energy storage with integrated smart BMS and long cycle life. 5 Years Warranty. Pan-India delivery.', 10),
  ('PR-011', 150000, 177000, 25, '5 Years Warranty', '["LiFePO4 (LFP) cell chemistry", "Integrated Smart BMS", "6000+ cycle life", "Bluetooth / RS485 monitoring", "Deep discharge and over-charge protection"]', '{"Chemistry": "LiFePO4", "Nominal Voltage": "51.2 V", "Capacity": "100 Ah", "Energy": "5.12 kWh", "Cycle Life": "6000+ cycles at 80% DoD", "BMS": "Integrated Smart BMS", "Operating Temperature": "-10 C to 55 C", "Protection": "Over-charge / over-discharge / short circuit"}', '48V LFP Batteries', 'LiFePO4 energy storage with integrated smart BMS and long cycle life.', 'PR LFP Battery 51.2V 100Ah | PowerRun Industries', 'Buy PR LFP Battery 51.2V 100Ah from PowerRun Industries. LiFePO4 energy storage with integrated smart BMS and long cycle life. 5 Years Warranty. Pan-India delivery.', 11),
  ('PR-012', 200000, 236000, 25, '5 Years Warranty', '["LiFePO4 (LFP) cell chemistry", "Integrated Smart BMS", "6000+ cycle life", "Bluetooth / RS485 monitoring", "Deep discharge and over-charge protection"]', '{"Chemistry": "LiFePO4", "Nominal Voltage": "51.2 V", "Capacity": "200 Ah", "Energy": "10.24 kWh", "Cycle Life": "6000+ cycles at 80% DoD", "BMS": "Integrated Smart BMS", "Operating Temperature": "-10 C to 55 C", "Protection": "Over-charge / over-discharge / short circuit"}', '48V LFP Batteries', 'LiFePO4 energy storage with integrated smart BMS and long cycle life.', 'PR LFP Battery 51.2V 200Ah | PowerRun Industries', 'Buy PR LFP Battery 51.2V 200Ah from PowerRun Industries. LiFePO4 energy storage with integrated smart BMS and long cycle life. 5 Years Warranty. Pan-India delivery.', 12),
  ('PR-013', 250000, 295000, 25, '5 Years Warranty', '["LiFePO4 (LFP) cell chemistry", "Integrated Smart BMS", "6000+ cycle life", "Bluetooth / RS485 monitoring", "Deep discharge and over-charge protection"]', '{"Chemistry": "LiFePO4", "Nominal Voltage": "51.2 V", "Capacity": "280 Ah", "Energy": "14.34 kWh", "Cycle Life": "6000+ cycles at 80% DoD", "BMS": "Integrated Smart BMS", "Operating Temperature": "-10 C to 55 C", "Protection": "Over-charge / over-discharge / short circuit"}', '48V LFP Batteries', 'LiFePO4 energy storage with integrated smart BMS and long cycle life.', 'PR LFP Battery 51.2V 280Ah | PowerRun Industries', 'Buy PR LFP Battery 51.2V 280Ah from PowerRun Industries. LiFePO4 energy storage with integrated smart BMS and long cycle life. 5 Years Warranty. Pan-India delivery.', 13),
  ('PR-014', 320000, 377500, 25, '5 Years Warranty', '["LiFePO4 (LFP) cell chemistry", "Integrated Smart BMS", "6000+ cycle life", "Bluetooth / RS485 monitoring", "Deep discharge and over-charge protection"]', '{"Chemistry": "LiFePO4", "Nominal Voltage": "51.2 V", "Capacity": "400 Ah", "Energy": "20.48 kWh", "Cycle Life": "6000+ cycles at 80% DoD", "BMS": "Integrated Smart BMS", "Operating Temperature": "-10 C to 55 C", "Protection": "Over-charge / over-discharge / short circuit"}', '48V LFP Batteries', 'LiFePO4 energy storage with integrated smart BMS and long cycle life.', 'PR LFP Battery 51.2V 400Ah | PowerRun Industries', 'Buy PR LFP Battery 51.2V 400Ah from PowerRun Industries. LiFePO4 energy storage with integrated smart BMS and long cycle life. 5 Years Warranty. Pan-India delivery.', 14),
  ('PR-015', 400000, 472000, 25, '5 Years Warranty', '["LiFePO4 (LFP) cell chemistry", "Integrated Smart BMS", "6000+ cycle life", "Bluetooth / RS485 monitoring", "Deep discharge and over-charge protection"]', '{"Chemistry": "LiFePO4", "Nominal Voltage": "51.2 V", "Capacity": "600 Ah", "Energy": "30.72 kWh", "Cycle Life": "6000+ cycles at 80% DoD", "BMS": "Integrated Smart BMS", "Operating Temperature": "-10 C to 55 C", "Protection": "Over-charge / over-discharge / short circuit"}', '48V LFP Batteries', 'LiFePO4 energy storage with integrated smart BMS and long cycle life.', 'PR LFP Battery 51.2V 600Ah | PowerRun Industries', 'Buy PR LFP Battery 51.2V 600Ah from PowerRun Industries. LiFePO4 energy storage with integrated smart BMS and long cycle life. 5 Years Warranty. Pan-India delivery.', 15),
  ('PR-016', 500000, 590000, 25, '5 Years Warranty', '["LiFePO4 (LFP) cell chemistry", "Integrated Smart BMS", "6000+ cycle life", "Bluetooth / RS485 monitoring", "Deep discharge and over-charge protection"]', '{"Chemistry": "LiFePO4", "Nominal Voltage": "51.2 V", "Capacity": "800 Ah", "Energy": "40.96 kWh", "Cycle Life": "6000+ cycles at 80% DoD", "BMS": "Integrated Smart BMS", "Operating Temperature": "-10 C to 55 C", "Protection": "Over-charge / over-discharge / short circuit"}', '48V LFP Batteries', 'LiFePO4 energy storage with integrated smart BMS and long cycle life.', 'PR LFP Battery 51.2V 800Ah | PowerRun Industries', 'Buy PR LFP Battery 51.2V 800Ah from PowerRun Industries. LiFePO4 energy storage with integrated smart BMS and long cycle life. 5 Years Warranty. Pan-India delivery.', 16),
  ('PR-017', 35000, 41500, 25, '10 Years Product / 25 Years Performance Warranty', '["High-efficiency mono PERC cells", "Anti-PID and salt-mist resistant", "Tempered anti-reflective glass", "Withstands 2400 Pa wind load", "Optimised low-light performance"]', '{"Peak Power": "450 Wp", "Cell Type": "Mono PERC", "Module Efficiency": "Up to 21.3%", "Max System Voltage": "1500 V DC", "Frame": "Anodised aluminium alloy", "Glass": "3.2 mm tempered AR coated", "Operating Temperature": "-40 C to 85 C"}', 'Mono PERC Panels', 'High-efficiency mono PERC solar module for rooftop and ground-mount systems.', 'PR Solar Panel 450W | PowerRun Industries', 'Buy PR Solar Panel 450W from PowerRun Industries. High-efficiency mono PERC solar module for rooftop and ground-mount systems. 10 Years Product / 25 Years Performance Warranty. Pan-India delivery.', 17),
  ('PR-018', 45000, 53000, 25, '10 Years Product / 25 Years Performance Warranty', '["High-efficiency mono PERC cells", "Anti-PID and salt-mist resistant", "Tempered anti-reflective glass", "Withstands 2400 Pa wind load", "Optimised low-light performance"]', '{"Peak Power": "535 Wp", "Cell Type": "Mono PERC", "Module Efficiency": "Up to 21.3%", "Max System Voltage": "1500 V DC", "Frame": "Anodised aluminium alloy", "Glass": "3.2 mm tempered AR coated", "Operating Temperature": "-40 C to 85 C"}', 'Mono PERC Panels', 'High-efficiency mono PERC solar module for rooftop and ground-mount systems.', 'PR Solar Panel 535W | PowerRun Industries', 'Buy PR Solar Panel 535W from PowerRun Industries. High-efficiency mono PERC solar module for rooftop and ground-mount systems. 10 Years Product / 25 Years Performance Warranty. Pan-India delivery.', 18),
  ('PR-019', 50000, 59000, 25, '10 Years Product / 25 Years Performance Warranty', '["High-efficiency mono PERC cells", "Anti-PID and salt-mist resistant", "Tempered anti-reflective glass", "Withstands 2400 Pa wind load", "Optimised low-light performance"]', '{"Peak Power": "550 Wp", "Cell Type": "Mono PERC", "Module Efficiency": "Up to 21.3%", "Max System Voltage": "1500 V DC", "Frame": "Anodised aluminium alloy", "Glass": "3.2 mm tempered AR coated", "Operating Temperature": "-40 C to 85 C"}', 'Mono PERC Panels', 'High-efficiency mono PERC solar module for rooftop and ground-mount systems.', 'PR Solar Panel 550W | PowerRun Industries', 'Buy PR Solar Panel 550W from PowerRun Industries. High-efficiency mono PERC solar module for rooftop and ground-mount systems. 10 Years Product / 25 Years Performance Warranty. Pan-India delivery.', 19),
  ('PR-020', 55000, 65000, 25, '10 Years Product / 25 Years Performance Warranty', '["High-efficiency mono PERC cells", "Anti-PID and salt-mist resistant", "Tempered anti-reflective glass", "Withstands 2400 Pa wind load", "Optimised low-light performance"]', '{"Peak Power": "580 Wp", "Cell Type": "Mono PERC", "Module Efficiency": "Up to 21.3%", "Max System Voltage": "1500 V DC", "Frame": "Anodised aluminium alloy", "Glass": "3.2 mm tempered AR coated", "Operating Temperature": "-40 C to 85 C"}', 'Bifacial Panels', 'High-efficiency mono PERC solar module for rooftop and ground-mount systems.', 'PR Solar Panel 580W | PowerRun Industries', 'Buy PR Solar Panel 580W from PowerRun Industries. High-efficiency mono PERC solar module for rooftop and ground-mount systems. 10 Years Product / 25 Years Performance Warranty. Pan-India delivery.', 20),
  ('PR-021', 60000, 71000, 25, '10 Years Product / 25 Years Performance Warranty', '["High-efficiency mono PERC cells", "Anti-PID and salt-mist resistant", "Tempered anti-reflective glass", "Withstands 2400 Pa wind load", "Optimised low-light performance"]', '{"Peak Power": "600 Wp", "Cell Type": "Mono PERC", "Module Efficiency": "Up to 21.3%", "Max System Voltage": "1500 V DC", "Frame": "Anodised aluminium alloy", "Glass": "3.2 mm tempered AR coated", "Operating Temperature": "-40 C to 85 C"}', 'Bifacial Panels', 'High-efficiency mono PERC solar module for rooftop and ground-mount systems.', 'PR Solar Panel 600W | PowerRun Industries', 'Buy PR Solar Panel 600W from PowerRun Industries. High-efficiency mono PERC solar module for rooftop and ground-mount systems. 10 Years Product / 25 Years Performance Warranty. Pan-India delivery.', 21),
  ('PR-022', 95000, 112000, 25, '18 Months Warranty', '["Designed for daily deep cycling", "Vibration-resistant enclosure", "Fast charge capable", "Integrated BMS protection", "Maintenance free"]', '{"Chemistry": "LiFePO4", "Nominal Voltage": "48 V", "Capacity": "100 Ah", "Energy": "4.8 kWh", "Cycle Life": "3000+ cycles", "Application": "E-Rickshaw / E-Loader", "BMS": "Integrated with charge balancing"}', '48V E-Rickshaw Batteries', 'Deep-cycle lithium battery pack engineered for daily e-rickshaw duty.', 'PR E-Rickshaw Battery 48V 100Ah | PowerRun Industries', 'Buy PR E-Rickshaw Battery 48V 100Ah from PowerRun Industries. Deep-cycle lithium battery pack engineered for daily e-rickshaw duty. 18 Months Warranty. Pan-India delivery.', 22),
  ('PR-023', 110000, 130000, 25, '18 Months Warranty', '["Designed for daily deep cycling", "Vibration-resistant enclosure", "Fast charge capable", "Integrated BMS protection", "Maintenance free"]', '{"Chemistry": "LiFePO4", "Nominal Voltage": "2 V", "Capacity": "100 Ah", "Energy": "0.2 kWh", "Cycle Life": "3000+ cycles", "Application": "E-Rickshaw / E-Loader", "BMS": "Integrated with charge balancing"}', '48V E-Rickshaw Batteries', 'Deep-cycle lithium battery pack engineered for daily e-rickshaw duty.', 'PR E-Rickshaw Battery 51.2V 100Ah | PowerRun Industries', 'Buy PR E-Rickshaw Battery 51.2V 100Ah from PowerRun Industries. Deep-cycle lithium battery pack engineered for daily e-rickshaw duty. 18 Months Warranty. Pan-India delivery.', 23),
  ('PR-024', 125000, 147500, 25, '18 Months Warranty', '["Designed for daily deep cycling", "Vibration-resistant enclosure", "Fast charge capable", "Integrated BMS protection", "Maintenance free"]', '{"Chemistry": "LiFePO4", "Nominal Voltage": "72 V", "Capacity": "100 Ah", "Energy": "7.2 kWh", "Cycle Life": "3000+ cycles", "Application": "E-Rickshaw / E-Loader", "BMS": "Integrated with charge balancing"}', '72V E-Rickshaw Batteries', 'Deep-cycle lithium battery pack engineered for daily e-rickshaw duty.', 'PR E-Rickshaw Battery 72V 100Ah | PowerRun Industries', 'Buy PR E-Rickshaw Battery 72V 100Ah from PowerRun Industries. Deep-cycle lithium battery pack engineered for daily e-rickshaw duty. 18 Months Warranty. Pan-India delivery.', 24),
  ('PR-025', 140000, 165000, 25, '18 Months Warranty', '["Designed for daily deep cycling", "Vibration-resistant enclosure", "Fast charge capable", "Integrated BMS protection", "Maintenance free"]', '{"Chemistry": "LiFePO4", "Nominal Voltage": "72 V", "Capacity": "150 Ah", "Energy": "10.8 kWh", "Cycle Life": "3000+ cycles", "Application": "E-Rickshaw / E-Loader", "BMS": "Integrated with charge balancing"}', '72V E-Rickshaw Batteries', 'Deep-cycle lithium battery pack engineered for daily e-rickshaw duty.', 'PR E-Rickshaw Battery 72V 150Ah | PowerRun Industries', 'Buy PR E-Rickshaw Battery 72V 150Ah from PowerRun Industries. Deep-cycle lithium battery pack engineered for daily e-rickshaw duty. 18 Months Warranty. Pan-India delivery.', 25)
) as v(sku, price, mrp, stock, warranty, features, specifications,
       subcategory_name, short_description, meta_title, meta_description, sort_order)
left join public.categories sub
       on sub.name = v.subcategory_name and sub.parent_id is not null
where p.sku = v.sku;

-- ---------------------------------------------------------------------------
-- 3. Backfill anything the seed did not cover
-- ---------------------------------------------------------------------------
update public.products
   set availability = case when coalesce(stock, 0) > 0 then 'in_stock' else 'out_of_stock' end
 where availability is null;

update public.products
   set slug = lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'))
 where slug is null or trim(slug) = '';

update public.products
   set meta_title = name || ' | PowerRun Industries'
 where meta_title is null;
