-- =============================================================================
-- PowerRun Industries - migration 41: Sales report split (owner request 2026-10-24)
--
-- report_sales() also returns
--   orders_split     website orders: confirmed vs pending (not confirmed yet),
--                    payment received vs not
--   pi               dealer PIs made in the period (by PI date): total, tax invoice
--                    issued, paid, unpaid
--   confirmed_sales  confirmed website orders + PI tax invoices - credit notes
--   received         payment received: paid website orders + paid PIs
-- Everything else is unchanged. Rollback: re-run report_sales from sql/40.
-- =============================================================================

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
    -- website orders split: confirmed vs still pending, payment received vs not
    'orders_split', (select jsonb_build_object(
        'confirmed_count', count(*) filter (where order_status <> 'pending'),
        'confirmed_value', coalesce(sum(total_amount) filter (where order_status <> 'pending'), 0),
        'pending_count', count(*) filter (where order_status = 'pending'),
        'pending_value', coalesce(sum(total_amount) filter (where order_status = 'pending'), 0),
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
    'confirmed_sales', (select coalesce(sum(total_amount), 0) from ok where order_status <> 'pending')
                       + (select coalesce(sum(total_amount), 0) from pis)
                       - (select coalesce(sum(total_amount), 0) from cn),
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
