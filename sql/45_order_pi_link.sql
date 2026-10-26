-- =============================================================================
-- PowerRun Industries - migration 45: Proforma Invoice link for the customer
--
-- Owner request 2026-10-26: send every pending COD order a PI the customer can open
-- on the phone, with bank / UPI details, and mark it as sent.
--   orders.pi_token      random, unguessable id used in https://powerrun.in/pi/?t=<token>
--   orders.pi_viewed_at  first time the customer opened the PI page
--   get_order_pi_public(token)  anon: the order in invoice shape, the company details,
--                               the bank / UPI details (company_private) and the amount
--                               still due. Nothing is returned for a cancelled order.
-- Bank details are only reachable with an order's own token; site_settings.company_private
-- stays admin-only.
-- Rollback: sql/45_order_pi_link_rollback.sql
-- =============================================================================

alter table public.orders add column if not exists pi_token uuid not null default gen_random_uuid();
create unique index if not exists orders_pi_token_idx on public.orders (pi_token);
alter table public.orders add column if not exists pi_viewed_at timestamptz;

create or replace function public.get_order_pi_public(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
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
    'due', case when v_order.payment_status = 'paid' then 0 else v_order.total_amount - v_order.advance_amount end,
    'company', v_pub - 'bank_name' - 'bank_account_name' - 'bank_account_number' - 'bank_ifsc' - 'bank_branch',
    'bank', jsonb_build_object(
      'bank_name', v_priv ->> 'bank_name', 'bank_account_name', v_priv ->> 'bank_account_name',
      'bank_account_number', v_priv ->> 'bank_account_number', 'bank_ifsc', v_priv ->> 'bank_ifsc',
      'bank_branch', v_priv ->> 'bank_branch', 'upi_id', v_priv ->> 'upi_id')
  );
end;
$fn$;
revoke execute on function public.get_order_pi_public(uuid) from public;
grant execute on function public.get_order_pi_public(uuid) to anon, authenticated;
