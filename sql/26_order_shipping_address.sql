-- ============================================================================
-- PowerRun Industries - migration 26 / separate shipping address on orders
--
-- Checkout can now take a delivery address different from the billing
-- address. create_website_order() is re-created from migration 15 with only
-- these additions: optional shipping_* keys in p_customer (validated when
-- shipping_same is false) saved to new orders.shipping_* columns. When the
-- customer does not give one, the billing address is copied. Existing orders
-- are backfilled the same way. Idempotent.
-- ============================================================================

alter table public.orders add column if not exists shipping_address text;
alter table public.orders add column if not exists shipping_city    text;
alter table public.orders add column if not exists shipping_state   text;
alter table public.orders add column if not exists shipping_pincode text;

update public.orders set
  shipping_address = coalesce(shipping_address, address),
  shipping_city    = coalesce(shipping_city, city),
  shipping_state   = coalesce(shipping_state, state),
  shipping_pincode = coalesce(shipping_pincode, pincode)
where shipping_address is null;

create or replace function public.create_website_order(
  p_customer       jsonb,
  p_items          jsonb,
  p_payment_method text default 'cod',
  p_coupon_code    text default null
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
  v_ship_same    boolean := coalesce((p_customer->>'shipping_same')::boolean, true);
  v_s_address    text := nullif(trim(p_customer->>'shipping_address'), '');
  v_s_city       text := nullif(trim(p_customer->>'shipping_city'), '');
  v_s_state      text := nullif(trim(p_customer->>'shipping_state'), '');
  v_s_pincode    text := nullif(trim(p_customer->>'shipping_pincode'), '');
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
  v_intra := v_seller_state is null or lower(v_seller_state) = lower(v_state);

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
    v_shipping, v_coupon_code, v_coupon_discount, v_total, v_state,
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
    'total_amount',     v_total
  );
end;
$fn$;

revoke execute on function public.create_website_order(jsonb, jsonb, text, text) from public;
grant execute on function public.create_website_order(jsonb, jsonb, text, text) to anon, authenticated;
