-- ============================================================================
-- PowerRun Industries - migration 25 / quote requests need admin approval
--
-- A product-page quote request now collects full customer details (billing and
-- shipping address, optional email/GSTIN) and only records the request: the
-- quotation is created as a DRAFT and nothing about it (number, price) is
-- returned to the visitor. A customer can open or download a quotation only
-- after an admin approves it by marking it Sent (or it is Accepted).
--
-- Replaces the functions from migration 24. Idempotent.
-- ============================================================================

drop function if exists public.submit_product_quote_request(text, text, uuid);

create or replace function public.submit_product_quote_request(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_name        text := nullif(trim(p_data->>'name'), '');
  v_mobile      text := public.pr_norm_mobile(p_data->>'mobile');
  v_email       text := nullif(trim(p_data->>'email'), '');
  v_gstin       text := upper(nullif(trim(p_data->>'gstin'), ''));
  v_address     text := nullif(trim(p_data->>'address'), '');
  v_city        text := nullif(trim(p_data->>'city'), '');
  v_state       text := nullif(trim(p_data->>'state'), '');
  v_pincode     text := nullif(regexp_replace(coalesce(p_data->>'pincode', ''), '\D', '', 'g'), '');
  v_same        boolean := coalesce((p_data->>'shipping_same')::boolean, true);
  v_s_address   text;
  v_s_city      text;
  v_s_state     text;
  v_s_pincode   text;
  v_product_id  uuid;
  v_product     products%rowtype;
  v_existing    uuid;
  v_customer_id uuid;
  v_quote_id    uuid;
  v_company_st  text;
  v_intra       boolean;
  v_price       numeric;
  v_mrp         numeric;
  v_rate        numeric;
  v_incl        boolean;
  v_taxable     numeric;
  v_gst         numeric;
  v_cgst        numeric;
  v_total       numeric;
  v_terms       text;
begin
  begin
    v_product_id := (p_data->>'product_id')::uuid;
  exception when others then
    raise exception 'Product not found' using errcode = 'P0001';
  end;

  if v_name is null or length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Please enter your name' using errcode = 'P0001';
  end if;
  if not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address' using errcode = 'P0001';
  end if;
  if v_gstin is not null and v_gstin !~ '^[0-9]{2}[A-Z0-9]{13}$' then
    raise exception 'GSTIN should be 15 characters' using errcode = 'P0001';
  end if;
  if v_address is null or v_city is null or v_state is null then
    raise exception 'Please enter the full billing address' using errcode = 'P0001';
  end if;
  if v_pincode is null or v_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'Please enter a valid 6-digit billing pincode' using errcode = 'P0001';
  end if;

  if v_same then
    v_s_address := v_address; v_s_city := v_city; v_s_state := v_state; v_s_pincode := v_pincode;
  else
    v_s_address := nullif(trim(p_data->>'shipping_address'), '');
    v_s_city    := nullif(trim(p_data->>'shipping_city'), '');
    v_s_state   := nullif(trim(p_data->>'shipping_state'), '');
    v_s_pincode := nullif(regexp_replace(coalesce(p_data->>'shipping_pincode', ''), '\D', '', 'g'), '');
    if v_s_address is null or v_s_city is null or v_s_state is null then
      raise exception 'Please enter the full shipping address' using errcode = 'P0001';
    end if;
    if v_s_pincode is null or v_s_pincode !~ '^[1-9][0-9]{5}$' then
      raise exception 'Please enter a valid 6-digit shipping pincode' using errcode = 'P0001';
    end if;
  end if;

  select * into v_product from products where id = v_product_id and is_active;
  if v_product.id is null then
    raise exception 'Product not found' using errcode = 'P0001';
  end if;

  select q.id into v_existing
  from quotations q
  where pr_norm_mobile(q.customer_mobile) = v_mobile
    and q.quotation_type = 'customer'
    and q.status in ('draft', 'sent')
    and q.created_at > now() - interval '1 day'
    and exists (select 1 from quotation_items qi where qi.quotation_id = q.id and qi.product_id = v_product_id)
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'existing', true, 'product_name', v_product.name);
  end if;

  select c.id into v_customer_id
  from customers c
  where pr_norm_mobile(c.mobile) = v_mobile
  order by c.created_at
  limit 1;

  if v_customer_id is null then
    insert into customers (name, mobile, email, gstin, address, city, state, pincode,
                           shipping_address, shipping_city, shipping_state, shipping_pincode, customer_type)
    values (v_name, v_mobile, v_email, v_gstin, v_address, v_city, v_state, v_pincode,
            v_s_address, v_s_city, v_s_state, v_s_pincode, 'retail')
    returning id into v_customer_id;
  else
    -- fill only blanks on an existing customer; never overwrite what the admin already has
    update customers set
      email            = coalesce(email, v_email),
      gstin            = coalesce(gstin, v_gstin),
      address          = coalesce(address, v_address),
      city             = coalesce(city, v_city),
      state            = coalesce(state, v_state),
      pincode          = coalesce(pincode, v_pincode),
      shipping_address = coalesce(shipping_address, v_s_address),
      shipping_city    = coalesce(shipping_city, v_s_city),
      shipping_state   = coalesce(shipping_state, v_s_state),
      shipping_pincode = coalesce(shipping_pincode, v_s_pincode)
    where id = v_customer_id;
  end if;

  insert into leads (product_id, customer_id, name, mobile, email, city, message, source, status)
  values (v_product.id, v_customer_id, v_name, v_mobile, v_email, v_city,
          'Quote requested from product page: ' || v_product.name || ' (draft quotation awaiting approval)',
          'website', 'new');

  select nullif(value->>'state', '') into v_company_st from site_settings where key = 'company';
  v_intra := v_company_st is null or lower(v_company_st) = lower(v_state);

  v_price := coalesce(v_product.price, 0);
  v_mrp   := greatest(coalesce(v_product.mrp, v_price), v_price);
  v_rate  := coalesce(v_product.gst_rate, 0);
  v_incl  := coalesce(v_product.price_includes_gst, true);

  if v_rate = 0 then
    v_taxable := v_price; v_gst := 0;
  elsif v_incl then
    v_taxable := round(v_price / (1 + v_rate / 100), 2); v_gst := v_price - v_taxable;
  else
    v_taxable := v_price; v_gst := round(v_price * v_rate / 100, 2);
  end if;
  v_total := case when v_incl then v_price else v_price + v_gst end;
  v_cgst  := case when v_intra then round(v_gst / 2, 2) else 0 end;

  select nullif(value->>'terms', '') into v_terms
  from site_settings where key = 'quotation_defaults';

  insert into quotations (
    quote_number, quotation_type, customer_id, customer_name, customer_mobile, customer_email, gstin,
    address, city, state, pincode, shipping_address, shipping_city, shipping_state, shipping_pincode,
    place_of_supply, status, valid_days, valid_until, terms,
    subtotal, mrp_total, discount_amount, taxable_amount, gst_amount,
    cgst_amount, sgst_amount, igst_amount, shipping_cost, total_amount,
    customer_type, created_by_name
  ) values (
    public.pr_next_quote_number_internal(), 'customer', v_customer_id, v_name, v_mobile, v_email, v_gstin,
    v_address, v_city, v_state, v_pincode, v_s_address, v_s_city, v_s_state, v_s_pincode,
    v_state, 'draft', 7, current_date + 7, v_terms,
    v_price, v_mrp, v_mrp - v_price, v_taxable, v_gst,
    v_cgst, case when v_intra then v_gst - v_cgst else 0 end, case when v_intra then 0 else v_gst end, 0, v_total,
    'retail', 'Website enquiry'
  ) returning id into v_quote_id;

  insert into quotation_items (
    quotation_id, product_id, product_name, product_sku, hsn_code, quantity,
    unit_price, mrp, gst_rate, price_includes_gst, taxable_amount, gst_amount,
    total_price, discount_percent, discount_amount, sort_order
  ) values (
    v_quote_id, v_product.id, v_product.name, v_product.sku, v_product.hsn_code, 1,
    v_price, v_mrp, v_rate, v_incl, v_taxable, v_gst,
    v_price, 0, 0, 0
  );

  return jsonb_build_object('ok', true, 'existing', false, 'product_name', v_product.name);
end;
$fn$;

revoke execute on function public.submit_product_quote_request(jsonb) from public;
grant execute on function public.submit_product_quote_request(jsonb) to anon, authenticated;

create or replace function public.get_product_quote_public(p_quote_number text, p_mobile text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  q quotations%rowtype;
begin
  select * into q
  from quotations
  where quote_number = trim(p_quote_number)
    and quotation_type = 'customer'
    and status in ('sent', 'accepted')
    and pr_norm_mobile(customer_mobile) = public.pr_norm_mobile(p_mobile)
  limit 1;

  if q.id is null then
    raise exception 'No approved quotation found for this number and mobile' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'quote_number', q.quote_number, 'status', q.status, 'customer_name', q.customer_name,
    'created_at', q.created_at, 'valid_until', q.valid_until,
    'customer_mobile', q.customer_mobile, 'customer_email', q.customer_email, 'gstin', q.gstin,
    'address', q.address, 'city', q.city, 'state', q.state, 'pincode', q.pincode,
    'shipping_address', q.shipping_address, 'shipping_city', q.shipping_city,
    'shipping_state', q.shipping_state, 'shipping_pincode', q.shipping_pincode,
    'subtotal', q.subtotal, 'mrp_total', q.mrp_total, 'discount_amount', q.discount_amount,
    'taxable_amount', q.taxable_amount, 'gst_amount', q.gst_amount,
    'cgst_amount', q.cgst_amount, 'sgst_amount', q.sgst_amount, 'igst_amount', q.igst_amount,
    'shipping_cost', q.shipping_cost, 'total_amount', q.total_amount, 'terms', q.terms,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'product_name', qi.product_name, 'sku', qi.product_sku, 'quantity', qi.quantity,
        'unit_price', qi.unit_price, 'mrp', qi.mrp, 'gst_rate', qi.gst_rate,
        'total_price', qi.total_price) order by qi.sort_order), '[]'::jsonb)
      from quotation_items qi where qi.quotation_id = q.id
    )
  );
end;
$fn$;

revoke execute on function public.get_product_quote_public(text, text) from public;
grant execute on function public.get_product_quote_public(text, text) to anon, authenticated;
