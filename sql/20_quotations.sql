-- ============================================================================
-- PowerRun Industries - migration 20 / Quotations (CRM Phase 2)
--
-- Admin builds a quote for a customer, prints/PDFs it, and converts it to a
-- real order once accepted. Line-item GST math mirrors create_website_order's
-- own branching exactly (sql/15_saved_addresses_and_coupons.sql) so a
-- converted order's totals match what was quoted.
--
-- SECURITY NOTE: create_website_order() hardcodes orders.user_id = auth.uid()
-- - it assumes the CALLER is the customer. admin_convert_quotation_to_order()
-- below does NOT reuse that function for exactly this reason: it resolves
-- orders.user_id from the quotation's own linked customer's customers.user_id
-- instead, so a converted order is correctly attributed to the real customer
-- (or stays a guest order, matching how guest checkout already behaves),
-- never to the admin who happened to click "Convert".
--
-- Additive and idempotent. Safe to run more than once.
-- ============================================================================

create sequence if not exists public.pr_quote_number_seq start with 1;

create table if not exists public.quotations (
  id                 uuid primary key default gen_random_uuid(),
  quote_number       text unique,
  customer_id        uuid not null references public.customers(id) on delete restrict,
  customer_name      text not null,
  customer_mobile    text not null,
  customer_email     text,
  address text, city text, state text, pincode text,

  status             text not null default 'draft'
                       check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  valid_until        date,
  terms              text,

  subtotal           numeric not null default 0,
  mrp_total          numeric not null default 0,
  discount_amount    numeric not null default 0,
  taxable_amount     numeric not null default 0,
  gst_amount         numeric not null default 0,
  cgst_amount        numeric not null default 0,
  sgst_amount        numeric not null default 0,
  igst_amount        numeric not null default 0,
  shipping_cost      numeric not null default 0,
  total_amount       numeric not null default 0,
  place_of_supply    text,

  converted_order_id uuid references public.orders(id) on delete set null,
  converted_at       timestamptz,

  created_by         uuid references auth.users(id) on delete set null,
  created_by_name    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.quotation_items (
  id                 uuid primary key default gen_random_uuid(),
  quotation_id       uuid not null references public.quotations(id) on delete cascade,
  product_id         uuid references public.products(id) on delete set null,
  product_name       text not null,
  product_sku        text,
  hsn_code           text,
  quantity           integer not null check (quantity > 0),
  unit_price         numeric not null default 0,
  mrp                numeric,
  gst_rate           numeric not null default 0,
  price_includes_gst boolean not null default true,
  taxable_amount     numeric not null default 0,
  gst_amount         numeric not null default 0,
  total_price        numeric not null default 0,
  sort_order         integer not null default 0
);

create index if not exists quotations_customer_id_idx on public.quotations(customer_id);
create index if not exists quotations_status_idx on public.quotations(status);
create index if not exists quotation_items_quotation_id_idx on public.quotation_items(quotation_id);

drop trigger if exists quotations_touch on public.quotations;
create trigger quotations_touch before update on public.quotations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS - admin only, every operation, no public/customer access at all.
-- Customers receive the quote PDF out-of-band, not through the database.
-- ---------------------------------------------------------------------------
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;

do $do$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('quotations', 'quotation_items') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$do$;

create policy quotations_admin_all on public.quotations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy quotation_items_admin_all on public.quotation_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.quotations, public.quotation_items from anon, authenticated;
grant select, insert, update, delete on public.quotations, public.quotation_items to authenticated;

-- ---------------------------------------------------------------------------
-- Quote numbering - pr_next_number itself is revoked from authenticated
-- (sql/07_harden_functions.sql), so every caller goes through a thin
-- admin-checked wrapper, exactly like calc_next_number() already does.
-- ---------------------------------------------------------------------------
create or replace function public.admin_next_quote_number()
returns text
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return public.pr_next_number('public.pr_quote_number_seq', 'PRQ');
end;
$fn$;

revoke execute on function public.admin_next_quote_number() from public, anon;
grant execute on function public.admin_next_quote_number() to authenticated;

-- ---------------------------------------------------------------------------
-- Convert an accepted quotation into a real order. The quote's own prices
-- are authoritative (the admin deliberately set them - possibly a
-- negotiated discount off catalogue price), so unlike create_website_order
-- this does not re-derive prices from the live products table. Stock is
-- still decremented so inventory stays correct; live stock availability is
-- deliberately NOT re-validated here (the admin already reviewed the quote -
-- a known, accepted v1 gap, not an oversight).
-- ---------------------------------------------------------------------------
create or replace function public.admin_convert_quotation_to_order(p_quotation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quote    record;
  v_customer record;
  v_order_id uuid;
  v_order_number text;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into v_quote from quotations where id = p_quotation_id;
  if v_quote.id is null then
    raise exception 'Quotation not found' using errcode = 'P0001';
  end if;
  if v_quote.status <> 'accepted' then
    raise exception 'Only an accepted quotation can be converted to an order' using errcode = 'P0001';
  end if;
  if v_quote.converted_order_id is not null then
    raise exception 'This quotation has already been converted to an order' using errcode = 'P0001';
  end if;

  select * into v_customer from customers where id = v_quote.customer_id;

  v_order_number := public.pr_next_number('public.pr_order_number_seq', 'PR');

  insert into orders (
    order_number, user_id, customer_id,
    customer_name, customer_mobile, customer_email,
    address, city, state, pincode,
    subtotal, mrp_total, discount_amount, taxable_amount,
    gst_amount, cgst_amount, sgst_amount, igst_amount,
    shipping_cost, total_amount, place_of_supply,
    order_status, payment_status, payment_method, notes
  ) values (
    v_order_number, v_customer.user_id, v_quote.customer_id,
    v_quote.customer_name, v_quote.customer_mobile, v_quote.customer_email,
    v_quote.address, v_quote.city, v_quote.state, v_quote.pincode,
    v_quote.subtotal, v_quote.mrp_total, v_quote.discount_amount, v_quote.taxable_amount,
    v_quote.gst_amount, v_quote.cgst_amount, v_quote.sgst_amount, v_quote.igst_amount,
    v_quote.shipping_cost, v_quote.total_amount, v_quote.place_of_supply,
    'pending', 'pending', 'cod', 'Converted from quotation ' || v_quote.quote_number
  ) returning id into v_order_id;

  insert into order_items (
    order_id, product_id, product_name, product_sku,
    quantity, unit_price, total_price, mrp, hsn_code, gst_rate, taxable_amount, gst_amount
  )
  select
    v_order_id, product_id, product_name, product_sku,
    quantity, unit_price, total_price, mrp, hsn_code, gst_rate, taxable_amount, gst_amount
  from quotation_items where quotation_id = p_quotation_id;

  update products p set stock = greatest(coalesce(p.stock, 0) - qi.quantity, 0)
  from quotation_items qi
  where qi.quotation_id = p_quotation_id and p.id = qi.product_id and p.availability = 'in_stock';

  update quotations set converted_order_id = v_order_id, converted_at = now()
  where id = p_quotation_id;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
end;
$fn$;

revoke execute on function public.admin_convert_quotation_to_order(uuid) from public, anon;
grant execute on function public.admin_convert_quotation_to_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard: "sent" quotations are the ones genuinely awaiting the
-- customer's response - matches how every other CRM badge means "needs a
-- look now" (new_leads, followups_overdue, dealer_new), not "draft" (the
-- admin's own work-in-progress) or a final state.
-- ---------------------------------------------------------------------------
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
                                     and warranty_end_date between current_date and current_date + 30),
    'quotations_pending',        (select count(*) from quotations where status = 'sent')
  );
end;
$fn$;

revoke execute on function public.crm_dashboard_stats() from public;
grant execute on function public.crm_dashboard_stats() to authenticated;

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
    'new_leads',         (select count(*) from leads where status = 'new'),
    'quotations_pending', (select count(*) from quotations where status = 'sent')
  );
end;
$fn$;

revoke execute on function public.admin_dashboard_stats() from public;
grant execute on function public.admin_dashboard_stats() to authenticated;
