-- ============================================================================
-- PowerRun Industries - migration 21 / Quotation Pro (CRM Phase 3A)
--
-- Extends the Phase 2 Quotations module (sql/20_quotations.sql) with:
--  - quotation types (customer / dealer / project) and their extra fields
--  - payment / delivery / warranty terms, freight/installation/round-off
--  - an Indian-financial-year quote number format (PRI/QTN/2026-27/0001),
--    replacing the plain PRQ-YYYY-00001 scheme - own FY-reset counter so
--    the shared pr_next_number() (used by orders/warranty/service/dealer
--    numbers, which never asked for an FY reset) is left untouched
--  - a sales-person field and a lightweight audit log
--  - customer fields (company/contact/GSTIN/type/shipping) reused by other
--    CRM records too, not just quotations
--
-- Additive and idempotent. Safe to run more than once. No existing
-- quotations need renumbering - production has zero real quotations today.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. customers - fields needed for dealer/project quoting, useful generally
-- ---------------------------------------------------------------------------
alter table public.customers add column if not exists company_name text;
alter table public.customers add column if not exists contact_person text;
alter table public.customers add column if not exists gstin text;
alter table public.customers add column if not exists whatsapp text;
alter table public.customers add column if not exists shipping_address text;
alter table public.customers add column if not exists shipping_city text;
alter table public.customers add column if not exists shipping_state text;
alter table public.customers add column if not exists shipping_pincode text;
alter table public.customers add column if not exists customer_type text;

do $do$
begin
  update public.customers set customer_type = 'retail' where customer_type is null;
  if not exists (select 1 from pg_constraint where conname = 'customers_type_check') then
    alter table public.customers add constraint customers_type_check
      check (customer_type in ('retail', 'dealer', 'project'));
  end if;
  alter table public.customers alter column customer_type set default 'retail';
end;
$do$;

-- ---------------------------------------------------------------------------
-- B. quotations - type, terms, pricing extensions, dealer/project fields
-- ---------------------------------------------------------------------------
alter table public.quotations add column if not exists quotation_type text;
update public.quotations set quotation_type = 'customer' where quotation_type is null;
do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'quotations_type_check') then
    alter table public.quotations add constraint quotations_type_check
      check (quotation_type in ('customer', 'dealer', 'project'));
  end if;
  alter table public.quotations alter column quotation_type set default 'customer';
  alter table public.quotations alter column quotation_type set not null;
end;
$do$;

alter table public.quotations add column if not exists sales_person uuid references public.admin_users(id) on delete set null;

-- customer snapshot additions (mirrors the existing billing snapshot fields)
alter table public.quotations add column if not exists company_name text;
alter table public.quotations add column if not exists contact_person text;
alter table public.quotations add column if not exists gstin text;
alter table public.quotations add column if not exists customer_type text;
alter table public.quotations add column if not exists shipping_address text;
alter table public.quotations add column if not exists shipping_city text;
alter table public.quotations add column if not exists shipping_state text;
alter table public.quotations add column if not exists shipping_pincode text;

-- payment / delivery / warranty / validity
alter table public.quotations add column if not exists payment_terms text;
alter table public.quotations add column if not exists estimated_delivery text;
alter table public.quotations add column if not exists dispatch_from text;
alter table public.quotations add column if not exists transportation text;
alter table public.quotations add column if not exists freight_terms text;
alter table public.quotations add column if not exists installation_included boolean not null default false;
alter table public.quotations add column if not exists commissioning_included boolean not null default false;
alter table public.quotations add column if not exists warranty_terms text;
alter table public.quotations add column if not exists valid_days integer;

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'quotations_freight_terms_check') then
    alter table public.quotations add constraint quotations_freight_terms_check
      check (freight_terms is null or freight_terms in ('paid', 'to_pay'));
  end if;
end;
$do$;

-- pricing extensions (subtotal/gst/etc already exist from Phase 2)
alter table public.quotations add column if not exists freight_cost numeric not null default 0;
alter table public.quotations add column if not exists installation_cost numeric not null default 0;
alter table public.quotations add column if not exists other_charges numeric not null default 0;
alter table public.quotations add column if not exists round_off numeric not null default 0;

-- dealer-header fields (only populated when quotation_type = 'dealer')
alter table public.quotations add column if not exists dealer_discount_percent numeric;
alter table public.quotations add column if not exists dealer_margin_percent numeric;
alter table public.quotations add column if not exists moq integer;
alter table public.quotations add column if not exists dealer_scheme text;
alter table public.quotations add column if not exists credit_terms text;

-- project fields (only populated when quotation_type = 'project')
alter table public.quotations add column if not exists project_name text;
alter table public.quotations add column if not exists project_location text;
alter table public.quotations add column if not exists client_name text;
alter table public.quotations add column if not exists consultant text;
alter table public.quotations add column if not exists reference_number text;
alter table public.quotations add column if not exists scope_of_work text;
alter table public.quotations add column if not exists project_timeline text;
alter table public.quotations add column if not exists delivery_schedule text;

create index if not exists quotations_type_idx on public.quotations(quotation_type);
create index if not exists quotations_sales_person_idx on public.quotations(sales_person);

-- ---------------------------------------------------------------------------
-- C. quotation_items - line-level discount, dealer price, category snapshot
-- ---------------------------------------------------------------------------
alter table public.quotation_items add column if not exists discount_percent numeric not null default 0;
alter table public.quotation_items add column if not exists discount_amount numeric not null default 0;
alter table public.quotation_items add column if not exists dealer_price numeric;
alter table public.quotation_items add column if not exists category_snapshot text;

-- ---------------------------------------------------------------------------
-- D. FY-aware quote numbering. Replaces the Phase 2 numbering; same RPC
-- name/signature, so quotations.js's save() needs no change. The shared
-- pr_next_number() is left untouched (orders/warranty/service/dealer
-- numbers keep their existing never-reset calendar-year scheme).
-- ---------------------------------------------------------------------------
create table if not exists public.pr_quote_number_counters (
  fy          text primary key,
  last_number integer not null default 0
);

alter table public.pr_quote_number_counters enable row level security;

do $do$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'pr_quote_number_counters' loop
    execute format('drop policy %I on public.pr_quote_number_counters', p.policyname);
  end loop;
end;
$do$;

create policy pr_quote_number_counters_admin_all on public.pr_quote_number_counters
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.pr_quote_number_counters from anon, authenticated;
grant select, insert, update on public.pr_quote_number_counters to authenticated;

create or replace function public.admin_next_quote_number()
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_fy  text;
  v_num integer;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  v_fy := case when extract(month from now()) >= 4
    then to_char(now(), 'YYYY') || '-' || to_char(now() + interval '1 year', 'YY')
    else to_char(now() - interval '1 year', 'YYYY') || '-' || to_char(now(), 'YY')
  end;

  insert into public.pr_quote_number_counters (fy, last_number) values (v_fy, 1)
    on conflict (fy) do update set last_number = pr_quote_number_counters.last_number + 1
    returning last_number into v_num;

  return 'PRI/QTN/' || v_fy || '/' || lpad(v_num::text, 4, '0');
end;
$fn$;

revoke execute on function public.admin_next_quote_number() from public, anon;
grant execute on function public.admin_next_quote_number() to authenticated;

-- ---------------------------------------------------------------------------
-- E. quotation_audit_log - lightweight event log (mirrors calc_audit_log's
-- shape from sql/14_profit_loss_calculator.sql), written from app code.
-- ---------------------------------------------------------------------------
create table if not exists public.quotation_audit_log (
  id                uuid primary key default gen_random_uuid(),
  quotation_id      uuid not null references public.quotations(id) on delete cascade,
  admin_user_id     uuid references auth.users(id) on delete set null,
  admin_name_snapshot text,
  action            text not null check (action in ('created', 'status_changed', 'edited', 'converted')),
  old_value         text,
  new_value         text,
  created_at        timestamptz not null default now()
);

create index if not exists quotation_audit_log_quotation_id_idx on public.quotation_audit_log(quotation_id);

alter table public.quotation_audit_log enable row level security;

do $do$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'quotation_audit_log' loop
    execute format('drop policy %I on public.quotation_audit_log', p.policyname);
  end loop;
end;
$do$;

create policy quotation_audit_log_admin_all on public.quotation_audit_log
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.quotation_audit_log from anon, authenticated;
grant select, insert on public.quotation_audit_log to authenticated;
