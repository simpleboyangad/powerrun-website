-- =============================================================================
-- PowerRun Industries - migration 48: advance payment instead of COD
-- (owner request 2026-11-01: stock is bought per order, so an order ships only
--  once it is prepaid or at least 50% has been paid)
--
--   * payment method 'advance_cod': advance_percent (50) of the total online now,
--     the rest on delivery, for any order amount (owner: "kitna ka bhi product ho";
--     full_online_below can later force full payment below an amount). Plain COD ('cod') is refused while
--     site_settings.payments.cod_enabled is false (set false here).
--   * orders.advance_required: the advance asked for. Razorpay is charged exactly
--     this (razorpay-create-order); verify-payment / the webhook then record it as
--     advance_amount and confirm the order (payment_status stays pending: the
--     balance is due on delivery).
--   * switch_order_to_advance(): the customer who closed the full-payment window can
--     pay the advance instead (same order).
--   * Pending COD orders placed before this: advance_required = 50%, so the PI link /
--     UPI QR asks for exactly that.
--   * get_order_public / get_order_pi_public return the advance; the PI shows "pay now".
-- Rollback: sql/48_advance_payment_rollback.sql
-- =============================================================================

alter table public.orders add column if not exists advance_required numeric(12,2) not null default 0;
alter table public.orders drop constraint if exists orders_advance_required_check;
alter table public.orders add constraint orders_advance_required_check
  check (advance_required >= 0 and advance_required <= total_amount);

insert into public.site_settings (key, value)
values ('payments', '{"razorpay_enabled": true, "cod_enabled": false, "advance_enabled": true, "advance_percent": 50, "full_online_below": 0}'::jsonb)
on conflict (key) do update
  set value = coalesce(public.site_settings.value, '{}'::jsonb)
              || '{"cod_enabled": false, "advance_enabled": true, "advance_percent": 50, "full_online_below": 0}'::jsonb;

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
  v_method          text := coalesce(p_payment_method, 'cod');
  v_pay             jsonb;
  v_adv_pct         numeric;
  v_full_below      numeric;
  v_adv_required    numeric := 0;
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

  if v_method not in ('cod', 'razorpay', 'advance_cod') then
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

  -- ---- 4c. payment rules (migration 48, Admin > Settings > Payments) -----
  -- 'advance_cod': part of the total online now (advance_percent, default 50%),
  -- the rest on delivery - for any amount unless full_online_below (default 0) is set,
  -- below which orders are paid fully online. Plain COD only while cod_enabled.
  select value into v_pay from site_settings where key = 'payments';
  v_adv_pct    := least(greatest(coalesce(nullif(v_pay->>'advance_percent', '')::numeric, 50), 1), 100);
  v_full_below := greatest(coalesce(nullif(v_pay->>'full_online_below', '')::numeric, 0), 0);
  if v_method = 'cod' and coalesce((v_pay->>'cod_enabled')::boolean, true) is false then
    raise exception 'Cash on Delivery without advance is not available. Please pay online.' using errcode = 'P0001';
  end if;
  if v_method = 'advance_cod' then
    if coalesce((v_pay->>'advance_enabled')::boolean, true) is false then
      raise exception 'Advance payment is not available. Please pay online.' using errcode = 'P0001';
    end if;
    if v_total < v_full_below then
      raise exception 'Orders below Rs % are paid fully online.', v_full_below using errcode = 'P0001';
    end if;
    v_adv_required := least(ceil(v_total * v_adv_pct / 100), v_total);
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
    order_status, payment_status, payment_method, advance_required
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
    'pending', 'pending', v_method, v_adv_required
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
    'gstin',            v_gstin,
    'payment_method',   v_method,
    'advance_required', v_adv_required
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.pr_record_razorpay_payment(p_event_id text, p_event_type text, p_rzp_order_id text, p_rzp_payment_id text, p_amount_paise bigint, p_currency text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  elsif v_order.payment_method = 'advance_cod' and v_order.advance_amount < v_order.advance_required
        and upper(coalesce(p_currency, '')) = 'INR' and p_amount_paise = round(v_order.advance_required * 100) then
    -- advance (migration 48): record it; the rest is collected on delivery
    update orders set advance_amount = advance_required,
           order_status = case when order_status in ('pending', 'new') then 'confirmed' else order_status end,
           razorpay_payment_id = p_rzp_payment_id, payment_verified_at = now(),
           cancelled_reason = case when order_status = 'cancelled'
             then trim(coalesce(cancelled_reason, '') || ' | ADVANCE PAID AFTER CANCEL - refund or restore the order') else cancelled_reason end
     where id = v_order.id;
    v_result := case when v_order.order_status = 'cancelled' then 'advance_after_cancel_needs_action' else 'advance_paid' end;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_order_public(p_order_number text, p_mobile text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order orders%rowtype;
  v_items jsonb;
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
           'hsn_code',     oi.hsn_code,
           'quantity',     oi.quantity,
           'unit_price',   oi.unit_price,
           'mrp',          oi.mrp,
           'gst_rate',     oi.gst_rate,
           'gst_amount',   oi.gst_amount,
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
    'mrp_total',       v_order.mrp_total,
    'discount_amount', v_order.discount_amount,
    'gst_amount',      v_order.gst_amount,
    'cgst_amount',     v_order.cgst_amount,
    'sgst_amount',     v_order.sgst_amount,
    'igst_amount',     v_order.igst_amount,
    'shipping_cost',   v_order.shipping_cost,
    'total_amount',    v_order.total_amount,
    'order_status',    v_order.order_status,
    'payment_status',  v_order.payment_status,
    'payment_method',  v_order.payment_method,
    'advance_amount',  v_order.advance_amount,
    'advance_required', v_order.advance_required,
    'tracking_number', v_order.tracking_number,
    'courier_partner', v_order.courier_partner,
    'created_at',      v_order.created_at,
    'confirmed_at',    v_order.confirmed_at,
    'packed_at',       v_order.packed_at,
    'shipped_at',      v_order.shipped_at,
    'delivered_at',    v_order.delivered_at,
    'timeline',        (select coalesce(jsonb_agg(jsonb_build_object('status', t.status, 'at', t.status_date,
                                                                     'description', t.description) order by t.status_date), '[]'::jsonb)
                          from delivery_timeline t where t.order_id = v_order.id),
    'items',           v_items
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_order_pi_public(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order orders%rowtype;
  v_items jsonb;
  v_pub   jsonb := coalesce((select value from site_settings where key = 'company'), '{}'::jsonb);
  v_priv  jsonb := coalesce((select value from site_settings where key = 'company_private'), '{}'::jsonb);
begin
  select * into v_order from orders where pi_token = p_token;
  if not found then
    raise exception 'This PI link is not valid' using errcode = 'P0001';
  end if;
  if v_order.order_status = 'cancelled' then
    return jsonb_build_object('cancelled', true, 'order_number', v_order.order_number);
  end if;

  if v_order.pi_viewed_at is null then
    update orders set pi_viewed_at = now() where id = v_order.id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_name', oi.product_name, 'product_sku', oi.product_sku, 'hsn_code', oi.hsn_code,
           'quantity', oi.quantity, 'unit_price', oi.unit_price, 'mrp', oi.mrp, 'gst_rate', oi.gst_rate,
           'taxable_amount', oi.taxable_amount, 'gst_amount', oi.gst_amount, 'total_price', oi.total_price
         ) order by oi.created_at), '[]'::jsonb)
    into v_items
  from order_items oi where oi.order_id = v_order.id;

  return jsonb_build_object(
    'order', jsonb_build_object(
      'order_number', v_order.order_number, 'created_at', v_order.created_at,
      'customer_name', v_order.customer_name, 'customer_mobile', v_order.customer_mobile,
      'customer_email', v_order.customer_email, 'customer_gstin', v_order.customer_gstin,
      'customer_business_name', v_order.customer_business_name,
      'address', v_order.address, 'city', v_order.city, 'state', v_order.state, 'pincode', v_order.pincode,
      'shipping_address', v_order.shipping_address, 'shipping_city', v_order.shipping_city,
      'shipping_state', v_order.shipping_state, 'shipping_pincode', v_order.shipping_pincode,
      'place_of_supply', v_order.place_of_supply, 'subtotal', v_order.subtotal, 'mrp_total', v_order.mrp_total,
      'coupon_code', v_order.coupon_code, 'coupon_discount', v_order.coupon_discount,
      'shipping_cost', v_order.shipping_cost, 'total_amount', v_order.total_amount,
      'payment_status', v_order.payment_status, 'payment_method', v_order.payment_method,
      'order_status', v_order.order_status, 'order_items', v_items),
    'advance', v_order.advance_amount,
    'advance_required', v_order.advance_required,
    -- what the customer should pay now: the advance still owed, otherwise the balance
    'pay_now', case when v_order.payment_status = 'paid' then 0
                    when v_order.advance_required > v_order.advance_amount then v_order.advance_required - v_order.advance_amount
                    else v_order.total_amount - v_order.advance_amount end,
    'due', case when v_order.payment_status = 'paid' then 0 else v_order.total_amount - v_order.advance_amount end,
    'company', v_pub - 'bank_name' - 'bank_account_name' - 'bank_account_number' - 'bank_ifsc' - 'bank_branch',
    'bank', jsonb_build_object(
      'bank_name', v_priv ->> 'bank_name', 'bank_account_name', v_priv ->> 'bank_account_name',
      'bank_account_number', v_priv ->> 'bank_account_number', 'bank_ifsc', v_priv ->> 'bank_ifsc',
      'bank_branch', v_priv ->> 'bank_branch', 'upi_id', v_priv ->> 'upi_id')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.switch_order_to_cod(p_order_id uuid, p_mobile text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v orders%rowtype;
begin
  select * into v from orders where id = p_order_id for update;
  if not found or public.pr_norm_mobile(v.customer_mobile) <> public.pr_norm_mobile(p_mobile) then
    raise exception 'Order not found' using errcode = 'P0001';
  end if;
  if v.payment_status = 'paid' then
    return jsonb_build_object('order_number', v.order_number, 'status', 'already_paid');
  end if;
  if v.payment_method is distinct from 'razorpay' or v.order_status <> 'pending'
     or v.created_at < now() - interval '2 days' then
    raise exception 'This order can no longer be changed - please call or WhatsApp us' using errcode = 'P0001';
  end if;
  if coalesce((select (value->>'cod_enabled')::boolean from site_settings where key = 'payments'), true) is false then
    raise exception 'Cash on Delivery is not available - please pay online, or call / WhatsApp us' using errcode = 'P0001';
  end if;
  update orders set payment_method = 'cod',
         notes = trim(coalesce(notes, '') || ' [Customer switched from online payment to COD]')
   where id = v.id;
  return jsonb_build_object('order_number', v.order_number, 'status', 'cod');
end;
$function$;


create or replace function public.switch_order_to_advance(p_order_id uuid, p_mobile text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v orders%rowtype;
  v_pay jsonb := coalesce((select value from site_settings where key = 'payments'), '{}'::jsonb);
  v_pct numeric := least(greatest(coalesce(nullif(v_pay->>'advance_percent', '')::numeric, 50), 1), 100);
  v_below numeric := greatest(coalesce(nullif(v_pay->>'full_online_below', '')::numeric, 0), 0);
  v_adv numeric;
begin
  select * into v from orders where id = p_order_id for update;
  if not found or public.pr_norm_mobile(v.customer_mobile) <> public.pr_norm_mobile(p_mobile) then
    raise exception 'Order not found' using errcode = 'P0001';
  end if;
  if v.payment_status = 'paid' then
    return jsonb_build_object('order_number', v.order_number, 'status', 'already_paid');
  end if;
  if v.payment_method = 'advance_cod' then
    return jsonb_build_object('order_number', v.order_number, 'status', 'advance', 'advance_required', v.advance_required);
  end if;
  if coalesce((v_pay->>'advance_enabled')::boolean, true) is false or v.total_amount < v_below then
    raise exception 'This order has to be paid fully online' using errcode = 'P0001';
  end if;
  if v.payment_method is distinct from 'razorpay' or v.order_status <> 'pending'
     or v.created_at < now() - interval '2 days' then
    raise exception 'This order can no longer be changed - please call or WhatsApp us' using errcode = 'P0001';
  end if;
  v_adv := least(ceil(v.total_amount * v_pct / 100), v.total_amount);
  update orders set payment_method = 'advance_cod', advance_required = v_adv,
         notes = trim(coalesce(notes, '') || ' [Customer chose ' || v_pct || '% advance instead of full online payment]')
   where id = v.id;
  return jsonb_build_object('order_number', v.order_number, 'status', 'advance', 'advance_required', v_adv);
end;
$fn$;
revoke execute on function public.switch_order_to_advance(uuid, text) from public;
grant execute on function public.switch_order_to_advance(uuid, text) to anon, authenticated;

-- pending COD orders placed before this: ask for the 50% advance
update public.orders
   set advance_required = least(ceil(total_amount * 50 / 100), total_amount)
 where not is_test and coalesce(payment_method, 'cod') = 'cod' and payment_status <> 'paid'
   and order_status in ('pending', 'confirmed', 'processing') and advance_required = 0;
