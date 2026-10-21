-- =============================================================================
-- PowerRun Industries - migration 36 / Phase 3: payments and stock
-- (docs/automation/SECURITY_REVIEW.md S1, S2, S3; PROJECT_AUDIT 4.1)
--
-- 1. payment_events + pr_record_razorpay_payment(): the razorpay-webhook Edge
--    Function records every signed Razorpay event once (event id is unique) and
--    marks the matching order paid only when the amount and currency match the
--    order in the database. A payment that arrives after the order was
--    auto-cancelled re-reserves the stock if it is still there, otherwise the order
--    is flagged in cancelled_reason for a refund.
-- 2. No automatic cancellation of unpaid online orders (owner decision): the
--    daily sales report reminds instead. Cancelling stays a manual admin action.
-- 3. create_website_order(): locks the ordered products (FOR UPDATE) before the
--    stock check, and labels its stock change for the ledger.
-- 4. stock_ledger: every change of products.stock with reason, before/after and
--    who did it, plus one opening-balance row per product.
--
-- Rollback: sql/36_phase3_payments_stock_rollback.sql
-- =============================================================================

-- 1 ---------------------------------------------------------------------------
create table if not exists public.payment_events (
  id                   bigint generated always as identity primary key,
  provider             text not null default 'razorpay',
  event_id             text not null unique,
  event_type           text not null,
  razorpay_order_id    text,
  razorpay_payment_id  text,
  amount_paise         bigint,
  currency             text,
  order_id             uuid references public.orders(id) on delete set null,
  result               text,
  received_at          timestamptz not null default now()
);
create index if not exists payment_events_rzp_order_idx on public.payment_events (razorpay_order_id);
alter table public.payment_events enable row level security;
do $do$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'payment_events' loop
    execute format('drop policy %I on public.payment_events', p.policyname);
  end loop; end; $do$;
create policy payment_events_admin_read on public.payment_events for select to authenticated using (public.is_admin());
revoke all on public.payment_events from anon, authenticated;
grant select on public.payment_events to authenticated;

create or replace function public.pr_record_razorpay_payment(
  p_event_id text, p_event_type text, p_rzp_order_id text, p_rzp_payment_id text,
  p_amount_paise bigint, p_currency text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_event  bigint;
  v_order  orders%rowtype;
  v_result text;
  v_short  text;
begin
  insert into payment_events (event_id, event_type, razorpay_order_id, razorpay_payment_id, amount_paise, currency)
  values (p_event_id, p_event_type, p_rzp_order_id, p_rzp_payment_id, p_amount_paise, p_currency)
  on conflict (event_id) do nothing
  returning id into v_event;
  if v_event is null then
    return 'duplicate';                                   -- Razorpay retried the same event
  end if;

  select * into v_order from orders where razorpay_order_id = p_rzp_order_id for update;
  if not found then
    v_result := 'unknown_order';
  elsif p_event_type not in ('payment.captured', 'order.paid') then
    v_result := 'logged';                                 -- e.g. payment.failed: nothing to change
  elsif upper(coalesce(p_currency, '')) <> 'INR' or p_amount_paise <> round(v_order.total_amount * 100) then
    v_result := 'amount_mismatch';                        -- never mark paid; owner checks Razorpay
  elsif v_order.payment_status = 'paid' then
    v_result := 'already_paid';
  elsif v_order.order_status = 'cancelled' then
    -- paid after the order was cancelled: take the stock back if it is still there
    select p.name into v_short
      from order_items oi join products p on p.id = oi.product_id
     where oi.order_id = v_order.id and p.availability = 'in_stock' and coalesce(p.stock, 0) < oi.quantity
     limit 1;
    if v_short is null then
      perform 1 from products where id in (select product_id from order_items where order_id = v_order.id)
       order by id for update;
      perform set_config('powerrun.stock_reason', 'paid after cancel ' || v_order.order_number, true);
      update products p set stock = greatest(coalesce(p.stock, 0) - oi.quantity, 0)
        from order_items oi where oi.order_id = v_order.id and p.id = oi.product_id and p.availability = 'in_stock';
      update products set availability = 'out_of_stock'
       where id in (select product_id from order_items where order_id = v_order.id)
         and availability = 'in_stock' and coalesce(stock, 0) = 0;
      update orders set payment_status = 'paid', order_status = 'confirmed', razorpay_payment_id = p_rzp_payment_id,
             payment_verified_at = now(), cancelled_reason = null,
             notes = trim(coalesce(notes, '') || ' [Paid after cancellation; stock re-reserved]')
       where id = v_order.id;
      v_result := 'paid_after_cancel_restored';
    else
      update orders set payment_status = 'paid', razorpay_payment_id = p_rzp_payment_id, payment_verified_at = now(),
             cancelled_reason = trim(coalesce(cancelled_reason, '') || ' | PAID AFTER CANCEL - no stock for "' || v_short || '": refund or arrange stock')
       where id = v_order.id;
      v_result := 'paid_after_cancel_needs_action';
    end if;
  else
    update orders set payment_status = 'paid',
           order_status = case when order_status in ('pending', 'new') then 'confirmed' else order_status end,
           razorpay_payment_id = p_rzp_payment_id, payment_verified_at = now()
     where id = v_order.id;
    v_result := 'paid';
  end if;

  update payment_events set result = v_result, order_id = v_order.id where id = v_event;
  return v_result;
end;
$fn$;
revoke execute on function public.pr_record_razorpay_payment(text, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.pr_record_razorpay_payment(text, text, text, text, bigint, text) to service_role;

-- 2 ---------------------------------------------------------------------------
-- Unpaid online orders are NOT cancelled automatically (owner decision, 2026-10-21):
-- the daily sales report lists online orders still unpaid after 2 hours instead.

-- restock trigger labels its change for the ledger (same logic as before)
create or replace function public.restock_cancelled_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.order_status = 'cancelled' and coalesce(old.order_status, '') <> 'cancelled' then
    perform set_config('powerrun.stock_reason', 'cancelled ' || new.order_number, true);
    update products p
       set stock = coalesce(p.stock, 0) + oi.quantity,
           availability = case when p.availability = 'out_of_stock' then 'in_stock' else p.availability end
      from order_items oi
     where oi.order_id = new.id and p.id = oi.product_id;
  end if;
  return new;
end;
$fn$;

-- 4 ---------------------------------------------------------------------------
create table if not exists public.stock_ledger (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  product_id  uuid not null references public.products(id) on delete cascade,
  change      integer not null,
  balance     integer,
  reason      text not null,
  actor       uuid,
  actor_role  text
);
create index if not exists stock_ledger_product_at_idx on public.stock_ledger (product_id, at desc);
alter table public.stock_ledger enable row level security;
do $do$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'stock_ledger' loop
    execute format('drop policy %I on public.stock_ledger', p.policyname);
  end loop; end; $do$;
create policy stock_ledger_admin_read on public.stock_ledger for select to authenticated using (public.is_admin());
revoke all on public.stock_ledger from anon, authenticated;
grant select on public.stock_ledger to authenticated;

create or replace function public.pr_stock_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_old integer := case when tg_op = 'UPDATE' then coalesce(old.stock, 0) else 0 end;
  v_new integer := coalesce(new.stock, 0);
begin
  if v_new = v_old then
    return new;
  end if;
  insert into stock_ledger (product_id, change, balance, reason, actor, actor_role)
  values (new.id, v_new - v_old, v_new,
          coalesce(nullif(current_setting('powerrun.stock_reason', true), ''),
                   case when tg_op = 'INSERT' then 'new product'
                        when public.is_admin() then 'admin edit' else 'system' end),
          auth.uid(), coalesce(auth.role(), current_user));
  return new;
end;
$fn$;
revoke execute on function public.pr_stock_ledger() from public, anon, authenticated;

drop trigger if exists products_stock_ledger on public.products;
create trigger products_stock_ledger after insert or update of stock on public.products
  for each row execute function public.pr_stock_ledger();

insert into stock_ledger (product_id, change, balance, reason)
select p.id, coalesce(p.stock, 0), coalesce(p.stock, 0), 'opening balance'
  from products p
 where not exists (select 1 from stock_ledger s where s.product_id = p.id);

-- 3 ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_website_order(p_customer jsonb, p_items jsonb, p_payment_method text DEFAULT 'cod'::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_ship_same    boolean := coalesce((p_customer->>'shipping_same')::boolean, true);
  v_s_address    text := nullif(trim(p_customer->>'shipping_address'), '');
  v_s_city       text := nullif(trim(p_customer->>'shipping_city'), '');
  v_s_state      text := nullif(trim(p_customer->>'shipping_state'), '');
  v_s_pincode    text := nullif(trim(p_customer->>'shipping_pincode'), '');
  -- GST invoice (B2B): optional; when given, the invoice is billed to this GSTIN
  v_gstin        text := nullif(upper(regexp_replace(coalesce(p_customer->>'gstin', ''), '\s', '', 'g')), '');
  v_business     text := nullif(trim(p_customer->>'business_name'), '');
  v_pos          text;
  v_subtotal     numeric := 0;
  v_mrp_total    numeric := 0;
  v_discount     numeric := 0;
  v_taxable      numeric := 0;
  v_gst          numeric := 0;
  v_gst_added    numeric := 0;
  v_shipping     numeric := 0;
  v_total        numeric := 0;
  v_ship_cfg     jsonb;
  v_company      jsonb;
  v_seller_state text;
  v_intra        boolean;
  v_lines        jsonb;
  v_bad          text;
  v_coupon_code     text := nullif(upper(trim(p_coupon_code)), '');
  v_coupon          coupons%rowtype;
  v_coupon_discount numeric := 0;
  v_prior_uses      integer;
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

  if v_ship_same then
    v_s_address := v_address; v_s_city := v_city; v_s_state := v_state; v_s_pincode := v_pincode;
  else
    if v_s_address is null or v_s_city is null or v_s_state is null then
      raise exception 'Please enter the full shipping address' using errcode = 'P0001';
    end if;
    if v_s_pincode is null or v_s_pincode !~ '^[1-9][0-9]{5}$' then
      raise exception 'Please enter a valid 6-digit shipping pincode' using errcode = 'P0001';
    end if;
  end if;
  if v_gstin is not null then
    if not public.pr_valid_gstin(v_gstin) then
      raise exception 'GSTIN "%" is not valid. Please check the 15-character number.', v_gstin using errcode = 'P0001';
    end if;
    if public.pr_gst_state_code(v_state) is distinct from substr(v_gstin, 1, 2) then
      raise exception 'GSTIN state code % does not match the billing state %. Enter the billing address registered for this GSTIN.',
        substr(v_gstin, 1, 2), v_state using errcode = 'P0001';
    end if;
    if v_business is null then
      raise exception 'Business / legal name is required for a GST invoice' using errcode = 'P0001';
    end if;
  else
    v_business := null;
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

  select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'quantity', qty)), '[]'::jsonb)
    into v_lines
  from (
    select r.product_id, sum(r.quantity)::int as qty
    from jsonb_to_recordset(p_items) as r(product_id uuid, quantity integer)
    group by r.product_id
  ) grouped;

  -- ---- 3. availability ---------------------------------------------------
  -- lock the ordered products until this order commits, so two orders can
  -- never both take the last unit (migration 36)
  perform 1 from products
   where id in (select l.product_id from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer))
   order by id for update;

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

  -- ---- 4. money, computed from the database only -------------------------
  select value into v_company from site_settings where key = 'company';
  v_seller_state := nullif(trim(coalesce(v_company->>'state', '')), '');
  -- With no seller state configured, treat the supply as intra-state so the
  -- tax is split CGST/SGST rather than silently charged as IGST.
  -- Place of supply (IGST Act s.10): a registered buyer is billed at the
  -- state of its GSTIN (bill-to); otherwise it is where the goods are delivered.
  v_pos   := case when v_gstin is not null then v_state else v_s_state end;
  v_intra := v_seller_state is null or lower(v_seller_state) = lower(v_pos);

  select
    coalesce(sum(p.price * l.quantity), 0),
    coalesce(sum(coalesce(p.mrp, p.price) * l.quantity), 0),
    coalesce(sum(
      case when coalesce(p.price_includes_gst, true)
           then (p.price * l.quantity) / (1 + coalesce(p.gst_rate, 0) / 100)
           else (p.price * l.quantity)
      end), 0),
    coalesce(sum(
      case when coalesce(p.gst_rate, 0) = 0 then 0
           when coalesce(p.price_includes_gst, true)
           then (p.price * l.quantity) - (p.price * l.quantity) / (1 + p.gst_rate / 100)
           else (p.price * l.quantity) * p.gst_rate / 100
      end), 0),
    coalesce(sum(
      case when coalesce(p.price_includes_gst, true) or coalesce(p.gst_rate, 0) = 0 then 0
           else (p.price * l.quantity) * p.gst_rate / 100
      end), 0)
  into v_subtotal, v_mrp_total, v_taxable, v_gst, v_gst_added
  from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
  join products p on p.id = l.product_id;

  v_subtotal  := round(v_subtotal, 2);
  v_mrp_total := round(v_mrp_total, 2);
  v_discount  := round(greatest(v_mrp_total - v_subtotal, 0), 2);
  v_taxable   := round(v_taxable, 2);
  v_gst       := round(v_gst, 2);
  v_gst_added := round(v_gst_added, 2);

  select value into v_ship_cfg from site_settings where key = 'shipping';
  v_shipping := coalesce((v_ship_cfg->>'flat_rate')::numeric, 0);
  if coalesce((v_ship_cfg->>'free_above')::numeric, 0) > 0
     and v_subtotal >= (v_ship_cfg->>'free_above')::numeric then
    v_shipping := 0;
  end if;

  -- GST is only ADDED to the total when prices are exclusive of it.
  v_total := round(v_subtotal + v_gst_added + v_shipping, 2);

  -- ---- 4b. coupon (optional, additive on top of the total above) --------
  if v_coupon_code is not null then
    select * into v_coupon from coupons where upper(code) = v_coupon_code;

    if not found then
      raise exception 'Coupon code "%" is not valid', v_coupon_code using errcode = 'P0001';
    end if;
    if not v_coupon.is_active then
      raise exception 'Coupon code "%" is no longer active', v_coupon_code using errcode = 'P0001';
    end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
      raise exception 'Coupon code "%" is not active yet', v_coupon_code using errcode = 'P0001';
    end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
      raise exception 'Coupon code "%" has expired', v_coupon_code using errcode = 'P0001';
    end if;
    if v_subtotal < coalesce(v_coupon.min_order_amount, 0) then
      raise exception 'Coupon code "%" needs a minimum order of Rs %', v_coupon_code, v_coupon.min_order_amount
        using errcode = 'P0001';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.usage_count >= v_coupon.usage_limit then
      raise exception 'Coupon code "%" has reached its usage limit', v_coupon_code using errcode = 'P0001';
    end if;
    if v_coupon.per_customer_limit is not null then
      select count(*) into v_prior_uses from coupon_redemptions
       where coupon_id = v_coupon.id and mobile = v_mobile;
      if v_prior_uses >= v_coupon.per_customer_limit then
        raise exception 'You have already used coupon code "%"', v_coupon_code using errcode = 'P0001';
      end if;
    end if;

    v_coupon_discount := case when v_coupon.discount_type = 'percent'
      then v_subtotal * v_coupon.discount_value / 100
      else v_coupon.discount_value
    end;
    if v_coupon.max_discount_amount is not null then
      v_coupon_discount := least(v_coupon_discount, v_coupon.max_discount_amount);
    end if;
    v_coupon_discount := round(least(v_coupon_discount, v_total), 2);
    v_total := greatest(round(v_total - v_coupon_discount, 2), 0);
  end if;

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
    shipping_address, shipping_city, shipping_state, shipping_pincode,
    subtotal, mrp_total, discount_amount, taxable_amount,
    gst_amount, cgst_amount, sgst_amount, igst_amount,
    shipping_cost, coupon_code, coupon_discount, total_amount, place_of_supply,
    customer_gstin, customer_business_name,
    order_status, payment_status, payment_method
  ) values (
    v_order_number, v_user_id, v_customer_id,
    v_name, v_mobile, v_email,
    v_address, v_city, v_state, v_pincode,
    v_s_address, v_s_city, v_s_state, v_s_pincode,
    v_subtotal, v_mrp_total, v_discount, v_taxable,
    v_gst,
    case when v_intra then round(v_gst / 2, 2) else 0 end,
    case when v_intra then v_gst - round(v_gst / 2, 2) else 0 end,
    case when v_intra then 0 else v_gst end,
    v_shipping, v_coupon_code, v_coupon_discount, v_total, v_pos,
    v_gstin, v_business,
    'pending', 'pending', coalesce(p_payment_method, 'cod')
  ) returning id into v_order_id;

  insert into order_items (
    order_id, product_id, product_name, product_sku, quantity,
    unit_price, total_price, mrp, hsn_code, gst_rate, taxable_amount, gst_amount
  )
  select
    v_order_id, p.id, p.name, p.sku, l.quantity,
    p.price, round(p.price * l.quantity, 2),
    p.mrp, p.hsn_code, coalesce(p.gst_rate, 0),
    round(case when coalesce(p.price_includes_gst, true)
               then (p.price * l.quantity) / (1 + coalesce(p.gst_rate, 0) / 100)
               else (p.price * l.quantity) end, 2),
    round(case when coalesce(p.gst_rate, 0) = 0 then 0
               when coalesce(p.price_includes_gst, true)
               then (p.price * l.quantity) - (p.price * l.quantity) / (1 + p.gst_rate / 100)
               else (p.price * l.quantity) * p.gst_rate / 100 end, 2)
  from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
  join products p on p.id = l.product_id;

  -- ---- 7. stock ----------------------------------------------------------
  perform set_config('powerrun.stock_reason', 'order ' || v_order_number, true);
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

  -- ---- 8. coupon redemption (only if one was actually applied) -----------
  if v_coupon_code is not null then
    insert into coupon_redemptions (coupon_id, order_id, customer_id, mobile, discount_amount)
    values (v_coupon.id, v_order_id, v_customer_id, v_mobile, v_coupon_discount);

    update coupons set usage_count = usage_count + 1 where id = v_coupon.id;
  end if;

  return jsonb_build_object(
    'order_id',         v_order_id,
    'order_number',     v_order_number,
    'subtotal',         v_subtotal,
    'discount',         v_discount,
    'gst',              v_gst,
    'shipping',         v_shipping,
    'coupon_code',      v_coupon_code,
    'coupon_discount',  v_coupon_discount,
    'total_amount',     v_total,
    'gstin',            v_gstin
  );
end;
$function$;
