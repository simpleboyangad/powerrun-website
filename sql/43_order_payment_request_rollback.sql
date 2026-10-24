-- Rollback for sql/43_order_payment_request.sql: removes the trigger and restores the
-- report functions from 42 / 40. The new order columns are kept (data).
drop trigger if exists orders_payment_request on public.orders;
drop function if exists public.pr_order_payment_request();

create or replace function public.report_sales(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare r jsonb;
begin
  if not public.pr_can_report() then raise exception 'Not authorised' using errcode = '42501'; end if;

  with o as (
    select * from orders
     where not is_test and pr_ist_date(created_at) between p_from and p_to
  ), ok as (select * from o where order_status <> 'cancelled'),
  oi as (
    select oi.*, p.category_id from order_items oi join ok on ok.id = oi.order_id
      left join products p on p.id = oi.product_id
  ), pis as (
    select * from proforma_invoices
     where invoice_number is not null and status <> 'cancelled' and invoice_date between p_from and p_to
  ), pall as (
    select * from proforma_invoices where status <> 'cancelled' and pi_date between p_from and p_to
  ), pii as (
    select coalesce(nullif(i ->> 'product_id', ''),       -- typed PI lines: match the catalogue by name
                    (select p.id::text from products p where lower(p.name) = lower(trim(i ->> 'product_name')) limit 1),
                    '') pid, i ->> 'product_name' name,
           coalesce((i ->> 'quantity')::numeric, 0) qty,
           coalesce((i ->> 'quantity')::numeric, 0) * coalesce((i ->> 'unit_price')::numeric, 0) value
      from pis, jsonb_array_elements(pis.items) i
  ), cn as (select * from credit_notes where cn_date between p_from and p_to),
  items as (
    select coalesce(product_id::text, '') pid, product_name name, quantity qty, total_price value from oi
    union all select pid, name, qty, value from pii
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'orders', (select jsonb_build_object('count', count(*), 'value', coalesce(sum(total_amount), 0),
                      'paid_value', coalesce(sum(total_amount) filter (where payment_status = 'paid'), 0),
                      'gst', coalesce(sum(gst_amount), 0),
                      'avg', coalesce(round(avg(total_amount), 2), 0)) from ok),
    'units', (select coalesce(sum(quantity), 0) from oi),
    -- website orders split: an order counts as confirmed only once its payment is Paid
    'orders_split', (select jsonb_build_object(
        'confirmed_count', count(*) filter (where payment_status = 'paid'),
        'confirmed_value', coalesce(sum(total_amount) filter (where payment_status = 'paid'), 0),
        'pending_count', count(*) filter (where payment_status <> 'paid'),
        'pending_value', coalesce(sum(total_amount) filter (where payment_status <> 'paid'), 0),
        'paid_count', count(*) filter (where payment_status = 'paid'),
        'paid_value', coalesce(sum(total_amount) filter (where payment_status = 'paid'), 0),
        'unpaid_value', coalesce(sum(total_amount) filter (where payment_status <> 'paid'), 0)) from ok),
    -- dealer PIs by PI date: made, tax invoice issued, paid
    'pi', (select jsonb_build_object(
        'count', count(*), 'value', coalesce(sum(total_amount), 0),
        'invoiced_count', count(*) filter (where invoice_number is not null),
        'invoiced_value', coalesce(sum(total_amount) filter (where invoice_number is not null), 0),
        'paid_count', count(*) filter (where status = 'paid'),
        'paid_value', coalesce(sum(total_amount) filter (where status = 'paid'), 0),
        'unpaid_value', coalesce(sum(total_amount) filter (where status <> 'paid'), 0)) from pall),
    'confirmed_sales', (select coalesce(sum(total_amount), 0) from ok where payment_status = 'paid')
                       + (select coalesce(sum(total_amount), 0) from pall where status = 'paid'),
    'received', (select coalesce(sum(total_amount), 0) from ok where payment_status = 'paid')
              + (select coalesce(sum(total_amount), 0) from pall where status = 'paid'),
    'by_payment', (select coalesce(jsonb_agg(x order by x.value desc), '[]'::jsonb) from (
        select coalesce(payment_method, '-') method, count(*) count, sum(total_amount) value from ok group by 1) x),
    'cancelled', (select jsonb_build_object('count', count(*), 'value', coalesce(sum(total_amount), 0))
                    from o where order_status = 'cancelled'),
    'pi_invoices', (select jsonb_build_object('count', count(*), 'value', coalesce(sum(total_amount), 0)) from pis),
    'credit_notes', (select jsonb_build_object('count', count(*), 'value', coalesce(sum(total_amount), 0)) from cn),
    'net_sales', (select coalesce(sum(total_amount), 0) from ok) + (select coalesce(sum(total_amount), 0) from pis)
                 - (select coalesce(sum(total_amount), 0) from cn),
    'daily', (select coalesce(jsonb_agg(x order by x.d), '[]'::jsonb) from (
        select pr_ist_date(created_at) d, count(*) orders, sum(total_amount) value from ok group by 1) x),
    'by_product', (select coalesce(jsonb_agg(x order by x.value desc), '[]'::jsonb) from (
        select max(name) name, sum(qty) units, sum(value) value from items
         group by case when pid <> '' then pid else lower(name) end order by sum(value) desc limit 30) x),
    'by_category', (select coalesce(jsonb_agg(x order by x.value desc), '[]'::jsonb) from (
        select coalesce(c.name, 'Other') name, sum(oi.quantity) units, sum(oi.total_price) value
          from oi left join categories c on c.id = oi.category_id group by 1) x),
    'by_state', (select coalesce(jsonb_agg(x order by x.value desc), '[]'::jsonb) from (
        select coalesce(nullif(shipping_state, ''), state, '-') state, count(*) count, sum(total_amount) value
          from ok group by 1 order by 3 desc limit 15) x)
  ) into r;
  return r;
end;
$fn$;

create or replace function public.report_receivables()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.pr_can_report() then raise exception 'Not authorised' using errcode = '42501'; end if;
  return jsonb_build_object(
    'cod_delivered_unpaid', (select coalesce(jsonb_agg(jsonb_build_object('order_number', order_number, 'customer', customer_name,
          'mobile', customer_mobile, 'city', city, 'amount', total_amount, 'delivered_at', delivered_at) order by delivered_at), '[]'::jsonb)
        from orders where not is_test and order_status = 'delivered' and payment_status <> 'paid'),
    'cod_open', (select jsonb_build_object('count', count(*), 'value', coalesce(sum(total_amount), 0)) from orders
        where not is_test and order_status not in ('delivered', 'cancelled') and payment_status <> 'paid'
          and coalesce(payment_method, 'cod') <> 'razorpay'),
    'online_unpaid', (select coalesce(jsonb_agg(jsonb_build_object('order_number', order_number, 'customer', customer_name,
          'amount', total_amount, 'created_at', created_at) order by created_at), '[]'::jsonb)
        from orders where not is_test and payment_method = 'razorpay' and payment_status in ('pending', 'failed')
          and order_status not in ('cancelled') and created_at < now() - interval '2 hours'),
    'pi_unpaid', (select coalesce(jsonb_agg(jsonb_build_object('pi_number', pi_number, 'invoice_number', invoice_number,
          'party', coalesce(business_name, customer_name), 'mobile', mobile, 'amount', total_amount, 'date', coalesce(invoice_date, pi_date))
          order by coalesce(invoice_date, pi_date)), '[]'::jsonb)
        from proforma_invoices where status = 'sent' or (invoice_number is not null and status not in ('paid', 'cancelled'))),
    'total', (select coalesce(sum(total_amount), 0) from orders where not is_test and order_status <> 'cancelled' and payment_status <> 'paid')
           + (select coalesce(sum(total_amount), 0) from proforma_invoices
               where status = 'sent' or (invoice_number is not null and status not in ('paid', 'cancelled')))
  );
end;
$fn$;
