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
