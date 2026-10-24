-- =============================================================================
-- PowerRun Industries - migration 40 / Phase 8: reports + health
--
-- Read-only report functions (jsonb), for Admin -> Reports and later the AI
-- assistant. All dates are India time; p_from / p_to are inclusive dates.
--   report_sales(from, to)       orders (by day / product / category / state / payment),
--                                PI tax invoices, credit notes, net sales, cancellations
--   report_receivables()         money still to come: COD delivered-unpaid, open COD,
--                                unpaid online orders, unpaid PIs
--   report_dispatch()            open orders by step, late to ship, late in transit,
--                                average days, dispatched without a tax invoice
--   report_leads(from, to)       leads by source with conversion, quotations by status
--   report_stock(from, to)       opening / in / out / closing per product from the ledger
--   report_margin(from, to)      ESTIMATE - only products with a purchase cost; human admins only
--   report_health()              payments webhook, approvals, GST gaps, follow-ups, agents
-- Human admins and agents may run them (except margin). Orders marked is_test are
-- left out everywhere (new column; tick "Test order" in the order drawer).
--
-- Rollback: sql/40_phase8_reports_rollback.sql
-- =============================================================================

alter table public.orders add column if not exists is_test boolean not null default false;

create or replace function public.pr_can_report()
returns boolean language sql stable security definer set search_path = public as $fn$
  select public.is_admin() or public.is_agent()
$fn$;

create or replace function public.pr_ist_date(p timestamptz)
returns date language sql immutable as $fn$ select (p at time zone 'Asia/Kolkata')::date $fn$;

-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
create or replace function public.report_dispatch()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.pr_can_report() then raise exception 'Not authorised' using errcode = '42501'; end if;
  return jsonb_build_object(
    'open_by_status', (select coalesce(jsonb_object_agg(order_status, n), '{}'::jsonb) from (
        select order_status, count(*) n from orders where not is_test and order_status not in ('delivered', 'cancelled')
         group by 1) x),
    'late_to_ship', (select coalesce(jsonb_agg(jsonb_build_object('order_number', order_number, 'customer', customer_name,
          'status', order_status, 'since', coalesce(confirmed_at, created_at)) order by coalesce(confirmed_at, created_at)), '[]'::jsonb)
        from orders where not is_test and order_status in ('confirmed', 'processing', 'packed')
          and coalesce(confirmed_at, created_at) < now() - interval '2 days'),
    'late_in_transit', (select coalesce(jsonb_agg(jsonb_build_object('order_number', order_number, 'customer', customer_name,
          'courier', courier_partner, 'tracking', tracking_number, 'shipped_at', coalesce(shipped_at, updated_at))
          order by coalesce(shipped_at, updated_at)), '[]'::jsonb)
        from orders where not is_test and order_status = 'shipped' and coalesce(shipped_at, updated_at) < now() - interval '9 days'),
    'avg_days_to_ship', (select round(avg(extract(epoch from shipped_at - coalesce(confirmed_at, created_at)) / 86400)::numeric, 1)
        from orders where not is_test and shipped_at > now() - interval '90 days'),
    'avg_days_in_transit', (select round(avg(extract(epoch from delivered_at - shipped_at) / 86400)::numeric, 1)
        from orders where not is_test and delivered_at > now() - interval '90 days' and shipped_at is not null),
    'shipped_without_invoice', (select coalesce(jsonb_agg(order_number order by created_at), '[]'::jsonb)
        from orders where not is_test and order_status in ('shipped', 'delivered') and invoice_number is null)
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
create or replace function public.report_leads(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.pr_can_report() then raise exception 'Not authorised' using errcode = '42501'; end if;
  return jsonb_build_object(
    'by_source', (select coalesce(jsonb_agg(x order by x.leads desc), '[]'::jsonb) from (
        select coalesce(source, 'other') source, count(*) leads, count(*) filter (where status = 'converted') converted,
               round(100.0 * count(*) filter (where status = 'converted') / nullif(count(*), 0), 1) conversion_pct
          from leads where pr_ist_date(created_at) between p_from and p_to group by 1) x),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) n from leads where pr_ist_date(created_at) between p_from and p_to group by 1) x),
    'quotations', (select coalesce(jsonb_object_agg(status, jsonb_build_object('count', n, 'value', v)), '{}'::jsonb) from (
        select status, count(*) n, coalesce(sum(total_amount), 0) v from quotations
         where pr_ist_date(created_at) between p_from and p_to group by 1) x),
    'dealer_enquiries', (select count(*) from dealer_enquiries where pr_ist_date(created_at) between p_from and p_to),
    'website_orders', (select count(*) from orders where not is_test and order_status <> 'cancelled'
                         and pr_ist_date(created_at) between p_from and p_to)
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
create or replace function public.report_stock(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_from timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  v_to   timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
begin
  if not public.pr_can_report() then raise exception 'Not authorised' using errcode = '42501'; end if;
  return jsonb_build_object(
    'movements', (select coalesce(jsonb_agg(x order by x.name), '[]'::jsonb) from (
        select p.name, p.sku,
               coalesce(p.stock, 0) - coalesce(sum(l.change) filter (where l.at >= v_from), 0) opening,
               coalesce(sum(l.change) filter (where l.at >= v_from and l.at < v_to and l.change > 0), 0) stock_in,
               -coalesce(sum(l.change) filter (where l.at >= v_from and l.at < v_to and l.change < 0), 0) stock_out,
               coalesce(p.stock, 0) - coalesce(sum(l.change) filter (where l.at >= v_to), 0) closing
          from products p join stock_ledger l on l.product_id = p.id
         group by p.id, p.name, p.sku, p.stock
        having count(*) filter (where l.at >= v_from and l.at < v_to) > 0) x),
    'low_stock', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'sku', sku, 'stock', coalesce(stock, 0)) order by stock, name), '[]'::jsonb)
        from products where is_active and coalesce(stock, 0) <= 5)
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
create or replace function public.report_margin(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  return (
    with sold as (
      select oi.product_id, sum(oi.quantity) units,
             sum(case when coalesce(oi.taxable_amount, 0) > 0 then oi.taxable_amount
                      else oi.total_price / (1 + coalesce(oi.gst_rate, 18) / 100) end) taxable
        from order_items oi join orders o on o.id = oi.order_id
       where not o.is_test and o.order_status <> 'cancelled' and pr_ist_date(o.created_at) between p_from and p_to
         and oi.product_id is not null
       group by 1
      union all
      select nullif(i ->> 'product_id', '')::uuid, sum((i ->> 'quantity')::numeric),
             sum((i ->> 'quantity')::numeric * (i ->> 'unit_price')::numeric / (1 + coalesce((i ->> 'gst_rate')::numeric, 18) / 100))
        from proforma_invoices pi, jsonb_array_elements(pi.items) i
       where pi.invoice_number is not null and pi.status <> 'cancelled' and pi.invoice_date between p_from and p_to
         and nullif(i ->> 'product_id', '') is not null
       group by 1
    ), s as (select product_id, sum(units) units, sum(taxable) taxable from sold group by 1),
    m as (
      select p.name, s.units, round(s.taxable, 2) sale_value,
             round(s.units * (c.purchase_cost + coalesce(c.default_freight, 0) + coalesce(c.default_packaging_cost, 0)
                              + coalesce(c.default_other_cost, 0)), 2) cost
        from s join products p on p.id = s.product_id
        join product_costs c on c.product_id = s.product_id and c.purchase_cost is not null
    )
    select jsonb_build_object(
      'note', 'Estimate: sale value without GST minus purchase cost + default freight, packaging and other cost per unit',
      'products', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'units', units, 'sale_value', sale_value, 'cost', cost,
                     'margin', sale_value - cost, 'margin_pct', round(100 * (sale_value - cost) / nullif(sale_value, 0), 1))
                     order by sale_value - cost desc) from m), '[]'::jsonb),
      'total', (select jsonb_build_object('sale_value', coalesce(sum(sale_value), 0), 'cost', coalesce(sum(cost), 0),
                     'margin', coalesce(sum(sale_value - cost), 0)) from m),
      'products_without_cost', (select count(*) from s where not exists (
                     select 1 from product_costs c where c.product_id = s.product_id and c.purchase_cost is not null))
    ));
end;
$fn$;

-- ---------------------------------------------------------------------------
create or replace function public.report_health()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.pr_can_report() then raise exception 'Not authorised' using errcode = '42501'; end if;
  return jsonb_build_object(
    'payments_7d', (select coalesce(jsonb_object_agg(coalesce(result, '-'), n), '{}'::jsonb) from (
        select result, count(*) n from payment_events where received_at > now() - interval '7 days' group by 1) x),
    'last_payment_event', (select max(received_at) from payment_events),
    'payment_problems', (select count(*) from payment_events
        where result in ('amount_mismatch', 'paid_after_cancel_needs_action') and received_at > now() - interval '30 days'),
    'approvals', (select jsonb_build_object(
        'pending', count(*) filter (where status = 'pending' and expires_at > now()),
        'failed_30d', count(*) filter (where status = 'failed' and created_at > now() - interval '30 days'),
        'expired_30d', count(*) filter (where (status = 'expired' or (status = 'pending' and expires_at <= now()))
                                         and created_at > now() - interval '30 days')) from approvals),
    'cancelled_invoice_without_credit_note',
        (select count(*) from orders o where not o.is_test and o.order_status = 'cancelled' and o.invoice_number is not null
            and not exists (select 1 from credit_notes c where c.invoice_number = o.invoice_number))
      + (select count(*) from proforma_invoices p where p.status = 'cancelled' and p.invoice_number is not null
            and not exists (select 1 from credit_notes c where c.invoice_number = p.invoice_number)),
    'shipped_without_invoice', (select count(*) from orders where not is_test and order_status in ('shipped', 'delivered')
                                  and invoice_number is null),
    'followups_overdue', (select count(*) from follow_ups where status = 'pending' and due_at < now()),
    'agent_actions_7d', (select coalesce(jsonb_object_agg(role, n), '{}'::jsonb) from (
        select u.role, count(*) n from audit_log a join admin_users u on u.user_id = a.actor
         where u.role like 'agent\_%' and a.at > now() - interval '7 days' group by 1) x),
    'last_order', (select max(created_at) from orders where not is_test)
  );
end;
$fn$;

do $do$
declare f text;
begin
  foreach f in array array['report_sales(date, date)', 'report_receivables()', 'report_dispatch()', 'report_leads(date, date)',
                           'report_stock(date, date)', 'report_margin(date, date)', 'report_health()', 'pr_can_report()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$do$;
