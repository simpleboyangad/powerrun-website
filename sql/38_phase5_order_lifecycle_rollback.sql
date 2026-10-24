-- Rollback for sql/38_phase5_order_lifecycle.sql
-- Removes the lifecycle rules, timeline/warranty automation and serial functions and
-- restores get_order_public / submit_warranty_registration. Kept (data): the new order
-- time columns, order_serials, timeline rows and auto-created warranties.
-- 'packed' orders are moved back to 'processing' so the old status check fits.
drop trigger if exists orders_lifecycle on public.orders;
drop trigger if exists orders_timeline on public.orders;
drop function if exists public.pr_order_lifecycle();
drop function if exists public.pr_order_timeline();
drop function if exists public.admin_save_order_serials(uuid, jsonb);
drop policy if exists delivery_timeline_agent_read on public.delivery_timeline;
update public.orders set order_status = 'processing' where order_status = 'packed';
alter table public.orders drop constraint if exists orders_order_status_check;
alter table public.orders add constraint orders_order_status_check check (order_status = any (array[
  'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']));

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
    'tracking_number', v_order.tracking_number,
    'courier_partner', v_order.courier_partner,
    'created_at',      v_order.created_at,
    'items',           v_items
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_warranty_registration(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
