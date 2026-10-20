-- =============================================================================
-- PowerRun Industries - manual Proforma Invoices (PI) for dealers and customers
--
-- Admin → Proforma Invoice (PI) builds a PI that is not tied to a website
-- order: a dealer or walk-in customer, any products at any (dealer) rate,
-- discount and freight. It prints with the same GST layout as the order
-- invoices (assets/js/invoice-doc.js).
--
-- Numbering: PRI/PI/<financial year>/0001, restarting every 1 April, issued
-- atomically by admin_next_pi_number() (same pattern as quotation numbers).
-- Admin-only; customers never read this table.
-- =============================================================================

create table if not exists public.proforma_invoices (
  id                  uuid primary key default gen_random_uuid(),
  pi_number           text not null unique,
  pi_date             date not null default current_date,
  valid_until         date,
  party_type          text not null default 'dealer' check (party_type in ('dealer', 'customer')),
  customer_name       text not null,
  business_name       text,
  gstin               text,
  mobile              text,
  email               text,
  address             text,
  city                text,
  state               text,
  pincode             text,
  ship_same           boolean not null default true,
  shipping_address    text,
  shipping_city       text,
  shipping_state      text,
  shipping_pincode    text,
  -- [{product_id, product_name, product_sku, hsn_code, quantity, unit_price (incl GST), gst_rate}]
  items               jsonb not null default '[]'::jsonb,
  discount_amount     numeric(12,2) not null default 0,
  shipping_cost       numeric(12,2) not null default 0,
  total_amount        numeric(12,2) not null default 0,
  payment_terms       text,
  notes               text,
  status              text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'cancelled')),
  created_by          uuid references auth.users(id) on delete set null,
  created_by_name     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists proforma_invoices_created_idx on public.proforma_invoices (created_at desc);
create index if not exists proforma_invoices_mobile_idx on public.proforma_invoices (mobile);

drop trigger if exists proforma_invoices_updated_at on public.proforma_invoices;
create trigger proforma_invoices_updated_at before update on public.proforma_invoices
  for each row execute function public.set_updated_at();

alter table public.proforma_invoices enable row level security;

do $do$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'proforma_invoices' loop
    execute format('drop policy %I on public.proforma_invoices', p.policyname);
  end loop;
end;
$do$;

create policy proforma_invoices_admin_all on public.proforma_invoices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.proforma_invoices from anon, authenticated;
grant select, insert, update, delete on public.proforma_invoices to authenticated;

-- ---------------------------------------------------------------- numbering
create table if not exists public.pr_pi_number_counters (
  fy          text primary key,
  last_number integer not null default 0
);

alter table public.pr_pi_number_counters enable row level security;

do $do$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'pr_pi_number_counters' loop
    execute format('drop policy %I on public.pr_pi_number_counters', p.policyname);
  end loop;
end;
$do$;

create policy pr_pi_number_counters_admin_all on public.pr_pi_number_counters
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.pr_pi_number_counters from anon, authenticated;
grant select, insert, update on public.pr_pi_number_counters to authenticated;

create or replace function public.admin_next_pi_number()
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_now timestamptz := now() at time zone 'Asia/Kolkata';
  v_fy  text;
  v_num integer;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  v_fy := case when extract(month from v_now) >= 4
    then to_char(v_now, 'YYYY') || '-' || to_char(v_now + interval '1 year', 'YY')
    else to_char(v_now - interval '1 year', 'YYYY') || '-' || to_char(v_now, 'YY')
  end;

  insert into public.pr_pi_number_counters (fy, last_number) values (v_fy, 1)
    on conflict (fy) do update set last_number = pr_pi_number_counters.last_number + 1
    returning last_number into v_num;

  return 'PRI/PI/' || v_fy || '/' || lpad(v_num::text, 4, '0');
end;
$fn$;

revoke execute on function public.admin_next_pi_number() from public, anon;
grant execute on function public.admin_next_pi_number() to authenticated;
