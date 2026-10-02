-- ============================================================================
-- PowerRun Industries - migration 19 / CRM Phase 1
--
-- Foundation for a CRM: reliable customer_id linkage across leads,
-- dealer_enquiries, warranties and service_tickets (the latter two already
-- HAD a customer_id column - migration 01 only made it nullable for guest
-- submissions - this migration backfills it and fixes the submit RPCs so
-- new rows populate it going forward), a real Leads workflow (source/
-- status/priority enums, assigned staff, estimated value, convert-to-
-- customer), a new follow_ups table, and the dashboard counts the admin
-- sidebar/CRM Overview page need.
--
-- Backfill rule: a customer is only linked when exactly ONE customer row
-- matches by normalized mobile number. Ambiguous (2+) or no match is left
-- null rather than guessed - never fabricate a link.
--
-- Additive and idempotent. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helper: normalize a mobile number to its last 10 digits for matching.
-- ---------------------------------------------------------------------------
create or replace function public.pr_norm_mobile(p text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $fn$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10)
$fn$;

-- ---------------------------------------------------------------------------
-- 1. Missing customer_id columns (leads, dealer_enquiries only - warranties
--    and service_tickets already have the column from the original schema).
-- ---------------------------------------------------------------------------
alter table public.leads add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.dealer_enquiries add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists leads_customer_id_idx           on public.leads(customer_id);
create index if not exists dealer_enquiries_customer_id_idx on public.dealer_enquiries(customer_id);
create index if not exists warranties_customer_id_idx        on public.warranties(customer_id);
create index if not exists service_tickets_customer_id_idx   on public.service_tickets(customer_id);
create index if not exists leads_mobile_idx                  on public.leads(mobile);

-- ---------------------------------------------------------------------------
-- 2. Backfill customer_id on existing rows - unambiguous matches only.
-- ---------------------------------------------------------------------------
do $backfill$
declare
  t text;
begin
  foreach t in array array['warranties', 'service_tickets', 'leads', 'dealer_enquiries'] loop
    execute format($f$
      with candidates as (
        select tbl.id as t_id, c.id as c_id,
               count(*) over (partition by tbl.id) as match_count
        from public.%1$I tbl
        join public.customers c
          on public.pr_norm_mobile(c.mobile) = public.pr_norm_mobile(tbl.mobile)
         and length(public.pr_norm_mobile(tbl.mobile)) = 10
        where tbl.customer_id is null
      )
      update public.%1$I x
      set customer_id = cand.c_id
      from candidates cand
      where cand.t_id = x.id and cand.match_count = 1
    $f$, t);
  end loop;
end;
$backfill$;

-- ---------------------------------------------------------------------------
-- 3. Going forward: the submit RPCs look up (never create) a matching
--    customer by normalized mobile and store the id. Every other line of
--    these functions is byte-identical to the version currently in effect.
-- ---------------------------------------------------------------------------
create or replace function public.submit_warranty_registration(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id         uuid;
  v_number     text;
  v_mobile     text := nullif(trim(p_data->>'mobile'), '');
  v_name       text := nullif(trim(p_data->>'name'), '');
  v_serial     text := nullif(trim(p_data->>'serial_number'), '');
  v_product_id uuid := nullif(p_data->>'product_id', '')::uuid;
  v_purchase   date := nullif(p_data->>'purchase_date', '')::date;
  v_start      date;
  v_months     integer;
  v_customer_id uuid;
begin
  if v_name is null then raise exception 'Name is required' using errcode = 'P0001'; end if;
  if v_mobile is null or not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;
  if v_serial is null then raise exception 'Product serial number is required' using errcode = 'P0001'; end if;
  if v_purchase is not null and v_purchase > current_date then
    raise exception 'The purchase date cannot be in the future' using errcode = 'P0001';
  end if;

  v_start := coalesce(v_purchase, current_date);

  select public.pr_warranty_months(p.warranty) into v_months
  from products p where p.id = v_product_id;
  v_months := coalesce(v_months, 12);

  select id into v_customer_id from customers
   where public.pr_norm_mobile(mobile) = public.pr_norm_mobile(v_mobile) limit 1;

  v_number := public.pr_next_number('public.pr_warranty_number_seq', 'PRW');

  insert into warranties (
    warranty_number, name, mobile, email, product_id, product_name,
    serial_number, purchase_date, invoice_number, dealer_name,
    address, city, state, pincode, status,
    warranty_start_date, warranty_end_date, customer_id
  ) values (
    v_number, v_name, v_mobile, nullif(trim(p_data->>'email'), ''),
    v_product_id, nullif(trim(p_data->>'product_name'), ''),
    v_serial, v_purchase,
    nullif(trim(p_data->>'invoice_number'), ''),
    nullif(trim(p_data->>'dealer_name'), ''),
    nullif(trim(p_data->>'address'), ''),
    nullif(trim(p_data->>'city'), ''),
    nullif(trim(p_data->>'state'), ''),
    nullif(trim(p_data->>'pincode'), ''),
    'pending',
    v_start,
    v_start + (v_months || ' months')::interval,
    v_customer_id
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'warranty_number', v_number, 'valid_until', v_start + (v_months || ' months')::interval);
end;
$fn$;

revoke execute on function public.submit_warranty_registration(jsonb) from public;
grant execute on function public.submit_warranty_registration(jsonb) to anon, authenticated;

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
  v_customer_id uuid;
begin
  if v_name is null then raise exception 'Name is required' using errcode = 'P0001'; end if;
  if v_mobile is null or not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;
  if v_issue is null then raise exception 'Please describe the issue' using errcode = 'P0001'; end if;

  select id into v_customer_id from customers
   where public.pr_norm_mobile(mobile) = public.pr_norm_mobile(v_mobile) limit 1;

  v_number := public.pr_next_number('public.pr_ticket_number_seq', 'PRS');

  insert into service_tickets (
    ticket_number, name, mobile, email, product_id, product_name,
    serial_number, issue_type, issue_description, purchase_date,
    attachment_url, address, city, state, pincode, status, priority, customer_id
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
    'open', 'normal', v_customer_id
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'ticket_number', v_number);
end;
$fn$;

revoke execute on function public.submit_service_request(jsonb) from public;
grant execute on function public.submit_service_request(jsonb) to anon, authenticated;

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
  v_customer_id uuid;
begin
  if v_name is null then raise exception 'Name is required' using errcode = 'P0001'; end if;
  if v_mobile is null or not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;

  select id into v_customer_id from customers
   where public.pr_norm_mobile(mobile) = public.pr_norm_mobile(v_mobile) limit 1;

  v_number := public.pr_next_number('public.pr_dealer_number_seq', 'PRD');

  insert into dealer_enquiries (
    enquiry_number, name, company_name, mobile, email,
    city, state, business_type, message, status, customer_id
  ) values (
    v_number, v_name, nullif(trim(p_data->>'company_name'), ''), v_mobile,
    nullif(trim(p_data->>'email'), ''),
    nullif(trim(p_data->>'city'), ''),
    nullif(trim(p_data->>'state'), ''),
    nullif(trim(p_data->>'business_type'), ''),
    nullif(trim(p_data->>'message'), ''),
    'new', v_customer_id
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'enquiry_number', v_number);
end;
$fn$;

revoke execute on function public.submit_dealer_enquiry(jsonb) from public;
grant execute on function public.submit_dealer_enquiry(jsonb) to anon, authenticated;

-- submit_contact_lead: stops trusting the client's free-text `source` (the
-- live contact form sends 'contact-page', which is outside the real enum
-- added below) - this RPC only ever represents the contact-page channel,
-- so it's hardcoded, and a customer_id lookup is added.
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
  v_customer_id uuid;
begin
  if v_name is null then raise exception 'Name is required' using errcode = 'P0001'; end if;
  if v_mobile is null or not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;

  select id into v_customer_id from customers
   where public.pr_norm_mobile(mobile) = public.pr_norm_mobile(v_mobile) limit 1;

  insert into leads (product_id, name, mobile, email, city, message, source, status, customer_id)
  values (
    nullif(p_data->>'product_id', '')::uuid, v_name, v_mobile,
    nullif(trim(p_data->>'email'), ''),
    nullif(trim(p_data->>'city'), ''),
    nullif(trim(p_data->>'message'), ''),
    'website',
    'new',
    v_customer_id
  ) returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$fn$;

revoke execute on function public.submit_contact_lead(jsonb) from public;
grant execute on function public.submit_contact_lead(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. leads: normalize existing free-text data BEFORE constraining it, then
--    add the spec's fields and enums.
-- ---------------------------------------------------------------------------
update public.leads set source = 'website' where source is null or source = 'contact-page';
update public.leads set source = 'other'   where source not in
  ('website', 'whatsapp', 'indiamart', 'instagram', 'facebook', 'google', 'referral', 'phone', 'walk-in', 'other');

update public.leads set status = 'new'        where status is null;
update public.leads set status = 'interested' where status = 'qualified';
update public.leads set status = 'lost'       where status = 'closed';
update public.leads set status = 'new'        where status not in
  ('new', 'contacted', 'interested', 'quotation_sent', 'negotiation', 'converted', 'lost');

alter table public.leads add column if not exists priority text default 'medium';
alter table public.leads add column if not exists estimated_value numeric;
alter table public.leads add column if not exists assigned_staff uuid references public.admin_users(id) on delete set null;
update public.leads set priority = 'medium' where priority is null;

alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads add constraint leads_source_check check (source in
  ('website', 'whatsapp', 'indiamart', 'instagram', 'facebook', 'google', 'referral', 'phone', 'walk-in', 'other'));

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check check (status in
  ('new', 'contacted', 'interested', 'quotation_sent', 'negotiation', 'converted', 'lost'));

alter table public.leads drop constraint if exists leads_priority_check;
alter table public.leads add constraint leads_priority_check check (priority in ('low', 'medium', 'high'));

create index if not exists leads_assigned_staff_idx on public.leads(assigned_staff);

-- ---------------------------------------------------------------------------
-- 5. Convert a lead into a real customer (admin-only).
-- ---------------------------------------------------------------------------
create or replace function public.convert_lead_to_customer(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_lead record;
  v_customer_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into v_lead from leads where id = p_lead_id;
  if v_lead.id is null then
    raise exception 'Lead not found' using errcode = 'P0001';
  end if;

  select id into v_customer_id from customers
   where public.pr_norm_mobile(mobile) = public.pr_norm_mobile(v_lead.mobile) limit 1;

  if v_customer_id is null then
    insert into customers (name, email, mobile, city)
    values (v_lead.name, v_lead.email, v_lead.mobile, v_lead.city)
    returning id into v_customer_id;
  end if;

  update leads set status = 'converted', customer_id = v_customer_id where id = p_lead_id;

  return jsonb_build_object('customer_id', v_customer_id);
end;
$fn$;

revoke execute on function public.convert_lead_to_customer(uuid) from public, anon;
grant execute on function public.convert_lead_to_customer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. follow_ups - the one genuinely new table.
-- ---------------------------------------------------------------------------
create table if not exists public.follow_ups (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid references public.leads(id) on delete cascade,
  customer_id    uuid references public.customers(id) on delete cascade,
  title          text not null,
  notes          text,
  due_at         timestamptz not null,
  status         text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  assigned_staff uuid references public.admin_users(id) on delete set null,
  created_by     uuid references public.admin_users(id) on delete set null,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint follow_ups_target_check check (num_nonnulls(lead_id, customer_id) = 1)
);

create index if not exists follow_ups_due_at_idx        on public.follow_ups(due_at);
create index if not exists follow_ups_status_idx        on public.follow_ups(status);
create index if not exists follow_ups_lead_id_idx       on public.follow_ups(lead_id);
create index if not exists follow_ups_customer_id_idx   on public.follow_ups(customer_id);
create index if not exists follow_ups_assigned_staff_idx on public.follow_ups(assigned_staff);

drop trigger if exists follow_ups_touch on public.follow_ups;
create trigger follow_ups_touch before update on public.follow_ups
  for each row execute function public.set_updated_at();

alter table public.follow_ups enable row level security;

do $do$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename = 'follow_ups' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$do$;

create policy follow_ups_admin_all on public.follow_ups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.follow_ups from anon, authenticated;
grant select, insert, update, delete on public.follow_ups to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Dashboard counts.
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
    'low_stock',         (select count(*) from products where is_active and coalesce(stock, 0) <= 5),
    'reviews_pending',   (select count(*) from product_reviews where status = 'pending'),
    'followups_today',   (select count(*) from follow_ups where status = 'pending' and due_at::date = current_date),
    'followups_overdue', (select count(*) from follow_ups where status = 'pending' and due_at < now()),
    'new_leads',         (select count(*) from leads where status = 'new')
  );
end;
$fn$;

revoke execute on function public.admin_dashboard_stats() from public;
grant execute on function public.admin_dashboard_stats() to authenticated;

create or replace function public.crm_dashboard_stats()
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
    'total_customers',          (select count(*) from customers),
    'new_customers_month',      (select count(*) from customers where created_at >= date_trunc('month', now())),
    'total_leads',               (select count(*) from leads),
    'new_leads_month',           (select count(*) from leads where created_at >= date_trunc('month', now())),
    'followups_today',           (select count(*) from follow_ups where status = 'pending' and due_at::date = current_date),
    'followups_overdue',         (select count(*) from follow_ups where status = 'pending' and due_at < now()),
    'service_open',              (select count(*) from service_tickets where status in ('open', 'in_progress')),
    'warranties_active',         (select count(*) from warranties where status = 'approved' and warranty_end_date >= current_date),
    'warranties_expiring_30d',   (select count(*) from warranties where status = 'approved'
                                     and warranty_end_date between current_date and current_date + 30)
  );
end;
$fn$;

revoke execute on function public.crm_dashboard_stats() from public;
grant execute on function public.crm_dashboard_stats() to authenticated;
