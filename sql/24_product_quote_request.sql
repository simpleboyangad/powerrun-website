-- ============================================================================
-- PowerRun Industries - migration 24 / product quote requests
--
-- A visitor on a product page enters name + mobile and gets a quotation for
-- that product straight away (7-day validity, website price, MRP shown as the
-- reference). Each request also creates a lead and a customer record if the
-- mobile is new, so the admin sees it in CRM and can send it on WhatsApp.
--
-- Public access is limited to two SECURITY DEFINER functions:
--   submit_product_quote_request  - creates a lead + quote (one per product
--                                   per mobile per day; repeats return the same)
--   get_product_quote_public      - reads a quote only with its number AND the
--                                   mobile it was issued to (same model as
--                                   get_order_public). Never returns internal
--                                   fields such as dealer margin or notes.
--
-- Additive and idempotent.
-- ============================================================================

create or replace function public.pr_next_quote_number_internal()
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_fy  text;
  v_num integer;
begin
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

revoke all on function public.pr_next_quote_number_internal() from public, anon, authenticated;

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
  return public.pr_next_quote_number_internal();
end;
$fn$;

create or replace function public.submit_product_quote_request(
  p_name       text,
  p_mobile     text,
  p_product_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_name        text := nullif(trim(p_name), '');
  v_mobile      text := public.pr_norm_mobile(p_mobile);
  v_product     products%rowtype;
  v_existing    quotations%rowtype;
  v_customer_id uuid;
  v_customer    text;
  v_quote_id    uuid;
  v_quote_no    text;
  v_price       numeric;
  v_mrp         numeric;
  v_rate        numeric;
  v_incl        boolean;
  v_taxable     numeric;
  v_gst         numeric;
  v_cgst        numeric;
  v_sgst        numeric;
  v_total       numeric;
  v_discount    numeric;
  v_terms       text;
  v_warranty    text;
begin
  if v_name is null or length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Please enter your name' using errcode = 'P0001';
  end if;
  if not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;

  select * into v_product from products where id = p_product_id and is_active;
  if v_product.id is null then
    raise exception 'Product not found' using errcode = 'P0001';
  end if;

  select q.* into v_existing
  from quotations q
  where pr_norm_mobile(q.customer_mobile) = v_mobile
    and q.quotation_type = 'customer'
    and q.status in ('draft', 'sent')
    and q.created_at > now() - interval '1 day'
    and exists (select 1 from quotation_items qi where qi.quotation_id = q.id and qi.product_id = p_product_id)
  order by q.created_at desc
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'quote_number', v_existing.quote_number, 'total_amount', v_existing.total_amount,
      'valid_until', v_existing.valid_until, 'product_name', v_product.name, 'existing', true);
  end if;

  select c.id, c.name into v_customer_id, v_customer
  from customers c
  where pr_norm_mobile(c.mobile) = v_mobile
  order by c.created_at
  limit 1;

  if v_customer_id is null then
    insert into customers (name, mobile, customer_type)
    values (v_name, v_mobile, 'retail')
    returning id, name into v_customer_id, v_customer;
  end if;

  insert into leads (product_id, customer_id, name, mobile, message, source, status)
  values (v_product.id, v_customer_id, v_name, v_mobile,
          'Quote requested from product page: ' || v_product.name, 'website', 'quotation_sent');

  v_price := coalesce(v_product.price, 0);
  v_mrp   := greatest(coalesce(v_product.mrp, v_price), v_price);
  v_rate  := coalesce(v_product.gst_rate, 0);
  v_incl  := coalesce(v_product.price_includes_gst, true);

  if v_rate = 0 then
    v_taxable := v_price;
    v_gst := 0;
  elsif v_incl then
    v_taxable := round(v_price / (1 + v_rate / 100), 2);
    v_gst := v_price - v_taxable;
  else
    v_taxable := v_price;
    v_gst := round(v_price * v_rate / 100, 2);
  end if;

  v_total    := case when v_incl then v_price else v_price + v_gst end;
  v_discount := v_mrp - v_price;
  v_cgst     := round(v_gst / 2, 2);
  v_sgst     := v_gst - v_cgst;

  select nullif(value->>'terms', ''), nullif(value->>'warranty_terms', '')
    into v_terms, v_warranty
  from site_settings where key = 'quotation_defaults';

  v_quote_no := public.pr_next_quote_number_internal();

  insert into quotations (
    quote_number, quotation_type, customer_id, customer_name, customer_mobile,
    status, valid_days, valid_until, terms, warranty_terms,
    subtotal, mrp_total, discount_amount, taxable_amount, gst_amount,
    cgst_amount, sgst_amount, igst_amount, shipping_cost, total_amount,
    customer_type, created_by_name
  ) values (
    v_quote_no, 'customer', v_customer_id, v_customer, v_mobile,
    'sent', 7, current_date + 7, v_terms, coalesce(v_warranty, v_product.warranty),
    v_price, v_mrp, v_discount, v_taxable, v_gst,
    v_cgst, v_sgst, 0, 0, v_total,
    'retail', 'Website enquiry'
  ) returning id into v_quote_id;

  insert into quotation_items (
    quotation_id, product_id, product_name, product_sku, hsn_code, quantity,
    unit_price, mrp, gst_rate, price_includes_gst, taxable_amount, gst_amount,
    total_price, discount_percent, discount_amount, sort_order, category_snapshot
  ) values (
    v_quote_id, v_product.id, v_product.name, v_product.sku, v_product.hsn_code, 1,
    v_price, v_mrp, v_rate, v_incl, v_taxable, v_gst,
    v_price, 0, 0, 0, null
  );

  return jsonb_build_object(
    'quote_number', v_quote_no, 'total_amount', v_total,
    'valid_until', current_date + 7, 'product_name', v_product.name, 'existing', false);
end;
$fn$;

revoke execute on function public.submit_product_quote_request(text, text, uuid) from public;
grant execute on function public.submit_product_quote_request(text, text, uuid) to anon, authenticated;

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
    and pr_norm_mobile(customer_mobile) = public.pr_norm_mobile(p_mobile)
  limit 1;

  if q.id is null then
    raise exception 'No quotation found for this number and mobile' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'quote_number', q.quote_number, 'status', q.status, 'customer_name', q.customer_name,
    'created_at', q.created_at, 'valid_until', q.valid_until,
    'subtotal', q.subtotal, 'mrp_total', q.mrp_total, 'discount_amount', q.discount_amount,
    'taxable_amount', q.taxable_amount, 'gst_amount', q.gst_amount,
    'cgst_amount', q.cgst_amount, 'sgst_amount', q.sgst_amount, 'igst_amount', q.igst_amount,
    'total_amount', q.total_amount, 'terms', q.terms, 'warranty_terms', q.warranty_terms,
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
