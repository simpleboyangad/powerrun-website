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
