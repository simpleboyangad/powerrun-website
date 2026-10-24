-- =============================================================================
-- PowerRun Industries - migration 38 / Phase 5: order lifecycle + serial numbers
--
-- 1. orders: new status 'packed' (pending -> confirmed -> packed -> shipped -> delivered;
--    'processing' stays valid for old rows) and the time each step was reached:
--    confirmed_at, packed_at, shipped_at, delivered_at, cancelled_at.
-- 2. pr_order_lifecycle (BEFORE UPDATE): for a human admin it enforces
--      - a cancelled or delivered order cannot be reopened (the webhook's
--        paid-after-cancel restore runs as service_role and is not affected),
--      - packed / shipped / delivered need one serial number per unit of every
--        product that carries a warranty,
--      - shipped needs the courier name,
--    and stamps the step times, delivery_status and actual_delivery_date.
-- 3. pr_order_timeline (AFTER UPDATE): one delivery_timeline row per status change
--    (shown to the customer on Track Order), and on delivery a warranty for every
--    serial: starts on the delivery date, length from the product's warranty text.
-- 4. order_serials + admin_save_order_serials(order, [{order_item_id, serial_number}]).
--    A serial is unique per product. Agents can read serials, not write them.
-- 5. get_order_public also returns the step times and the timeline;
--    submit_warranty_registration returns the existing warranty instead of a
--    duplicate when that serial already has one for the same mobile.
--
-- Rollback: sql/38_phase5_order_lifecycle_rollback.sql
-- =============================================================================

-- 1 ---------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_order_status_check;
alter table public.orders add constraint orders_order_status_check check (order_status = any (array[
  'pending', 'confirmed', 'processing', 'packed', 'shipped', 'delivered', 'cancelled']));
alter table public.orders add column if not exists confirmed_at timestamptz;
alter table public.orders add column if not exists packed_at    timestamptz;
alter table public.orders add column if not exists shipped_at   timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists cancelled_at timestamptz;

-- 4 (table first, the triggers use it) ----------------------------------------
create table if not exists public.order_serials (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  order_item_id  uuid not null references public.order_items(id) on delete cascade,
  product_id     uuid references public.products(id) on delete set null,
  serial_number  text not null check (length(serial_number) between 3 and 60),
  warranty_id    uuid references public.warranties(id) on delete set null,
  created_by     uuid,
  created_at     timestamptz not null default now()
);
create unique index if not exists order_serials_product_serial_key on public.order_serials (product_id, upper(serial_number));
create index if not exists order_serials_order_idx on public.order_serials (order_id);
create index if not exists order_serials_serial_idx on public.order_serials (upper(serial_number));

alter table public.order_serials enable row level security;
do $do$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'order_serials' loop
    execute format('drop policy %I on public.order_serials', p.policyname);
  end loop; end; $do$;
create policy order_serials_admin_read on public.order_serials for select to authenticated using (public.is_admin());
create policy order_serials_agent_read on public.order_serials for select to authenticated using (public.is_agent());
revoke all on public.order_serials from anon, authenticated;
grant select on public.order_serials to authenticated;     -- writes only through admin_save_order_serials
drop trigger if exists order_serials_audit on public.order_serials;
create trigger order_serials_audit after insert or update or delete on public.order_serials
  for each row execute function public.pr_audit();

-- does this product need a serial number (it carries a real warranty)?
create or replace function public.pr_needs_serial(p_product uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce((select p.warranty is not null and trim(p.warranty) <> ''
                          and p.warranty !~* '^\s*no\s+warranty'
                     from products p where p.id = p_product), false)
$fn$;

create or replace function public.admin_save_order_serials(p_order_id uuid, p_serials jsonb)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_order orders%rowtype;
  v_n integer := 0;
  r record;
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0001'; end if;
  if v_order.order_status in ('delivered', 'cancelled') then
    raise exception 'Order is %: serial numbers can no longer be changed', v_order.order_status using errcode = 'P0001';
  end if;

  delete from order_serials where order_id = p_order_id;
  for r in
    select oi.id item_id, oi.product_id, oi.product_name, oi.quantity,
           upper(trim(s ->> 'serial_number')) serial
      from jsonb_array_elements(coalesce(p_serials, '[]'::jsonb)) s
      join order_items oi on oi.id = (s ->> 'order_item_id')::uuid and oi.order_id = p_order_id
     where coalesce(trim(s ->> 'serial_number'), '') <> ''
  loop
    if exists (select 1 from order_serials x where x.product_id = r.product_id and upper(x.serial_number) = r.serial) then
      raise exception 'Serial % is already used for %', r.serial, r.product_name using errcode = 'P0001';
    end if;
    insert into order_serials (order_id, order_item_id, product_id, serial_number, created_by)
    values (p_order_id, r.item_id, r.product_id, r.serial, auth.uid());
    v_n := v_n + 1;
  end loop;

  for r in select oi.product_name, oi.quantity, count(s.id) n
             from order_items oi left join order_serials s on s.order_item_id = oi.id
            where oi.order_id = p_order_id group by oi.id, oi.product_name, oi.quantity loop
    if r.n > r.quantity then
      raise exception '% has % serials for % units', r.product_name, r.n, r.quantity using errcode = 'P0001';
    end if;
  end loop;
  return v_n;
end;
$fn$;
revoke execute on function public.admin_save_order_serials(uuid, jsonb) from public, anon;
grant execute on function public.admin_save_order_serials(uuid, jsonb) to authenticated;
revoke execute on function public.pr_needs_serial(uuid) from public, anon;
grant execute on function public.pr_needs_serial(uuid) to authenticated;

-- 2 ---------------------------------------------------------------------------
create or replace function public.pr_order_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_missing text;
begin
  if new.order_status is not distinct from old.order_status then return new; end if;

  if public.is_admin() then
    if old.order_status = 'cancelled' then
      raise exception 'Cancelled order can not be reopened - place a new order instead' using errcode = 'P0001';
    end if;
    if old.order_status = 'delivered' then
      raise exception 'Delivered order can not change status - use Service / Warranty for problems' using errcode = 'P0001';
    end if;
    if new.order_status in ('packed', 'shipped', 'delivered') then
      select string_agg(oi.product_name || ' (' || coalesce(s.n, 0) || '/' || oi.quantity || ')', ', ')
        into v_missing
        from order_items oi
        left join (select order_item_id, count(*) n from order_serials group by 1) s on s.order_item_id = oi.id
       where oi.order_id = new.id and public.pr_needs_serial(oi.product_id) and coalesce(s.n, 0) < oi.quantity;
      if v_missing is not null then
        raise exception 'Serial numbers missing: % - save serials first', v_missing using errcode = 'P0001';
      end if;
    end if;
    if new.order_status = 'shipped' and coalesce(trim(new.courier_partner), '') = '' then
      raise exception 'Enter the courier name before marking shipped' using errcode = 'P0001';
    end if;
  end if;

  case new.order_status
    when 'confirmed' then new.confirmed_at := coalesce(new.confirmed_at, now());
    when 'processing' then new.confirmed_at := coalesce(new.confirmed_at, now());
    when 'packed' then
      new.confirmed_at := coalesce(new.confirmed_at, now());
      new.packed_at := coalesce(new.packed_at, now());
    when 'shipped' then
      new.confirmed_at := coalesce(new.confirmed_at, now());
      new.packed_at := coalesce(new.packed_at, now());
      new.shipped_at := coalesce(new.shipped_at, now());
      new.delivery_status := 'shipped';
    when 'delivered' then
      new.confirmed_at := coalesce(new.confirmed_at, now());
      new.packed_at := coalesce(new.packed_at, now());
      new.shipped_at := coalesce(new.shipped_at, now());
      new.delivered_at := coalesce(new.delivered_at, now());
      new.actual_delivery_date := coalesce(new.actual_delivery_date, (now() at time zone 'Asia/Kolkata')::date);
      new.delivery_status := 'delivered';
    when 'cancelled' then new.cancelled_at := now();
    else null;
  end case;
  if old.order_status = 'cancelled' then new.cancelled_at := null; end if;   -- paid-after-cancel restore
  return new;
end;
$fn$;
drop trigger if exists orders_lifecycle on public.orders;
create trigger orders_lifecycle before update of order_status on public.orders
  for each row execute function public.pr_order_lifecycle();

-- 3 ---------------------------------------------------------------------------
create or replace function public.pr_order_timeline()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_start date;
  v_wid uuid;
  r record;
begin
  if new.order_status is not distinct from old.order_status then return null; end if;

  insert into delivery_timeline (order_id, status, status_date, description)
  values (new.id, new.order_status, now(),
          case new.order_status
            when 'confirmed' then 'Order confirmed'
            when 'processing' then 'Order is being prepared'
            when 'packed' then 'Packed and ready to ship'
            when 'shipped' then 'Shipped' || coalesce(' with ' || nullif(trim(new.courier_partner), ''), '')
                                || coalesce(' - tracking ' || nullif(trim(new.tracking_number), ''), '')
            when 'delivered' then 'Delivered'
            when 'cancelled' then 'Order cancelled'
            else initcap(new.order_status) end);

  if new.order_status = 'delivered' then
    v_start := coalesce(new.actual_delivery_date, (now() at time zone 'Asia/Kolkata')::date);
    for r in select s.id sid, s.serial_number, s.product_id, oi.product_name, p.warranty
               from order_serials s join order_items oi on oi.id = s.order_item_id
               left join products p on p.id = s.product_id
              where s.order_id = new.id and s.warranty_id is null loop
      select id into v_wid from warranties
       where product_id is not distinct from r.product_id and upper(serial_number) = upper(r.serial_number) limit 1;
      if v_wid is null then
        insert into warranties (warranty_number, name, mobile, email, product_id, product_name, serial_number,
                                purchase_date, invoice_number, order_id, customer_id, address, city, state, pincode,
                                status, warranty_type, warranty_period_months, warranty_start_date, warranty_end_date, notes)
        values (public.pr_next_number('public.pr_warranty_number_seq', 'PRW'), new.customer_name, new.customer_mobile,
                new.customer_email, r.product_id, r.product_name, r.serial_number, v_start, new.invoice_number,
                new.id, new.customer_id, coalesce(new.shipping_address, new.address), coalesce(new.shipping_city, new.city),
                coalesce(new.shipping_state, new.state), coalesce(new.shipping_pincode, new.pincode),
                'approved', 'standard', public.pr_warranty_months(r.warranty), v_start,
                v_start + (public.pr_warranty_months(r.warranty) || ' months')::interval,
                'Auto-registered on delivery of ' || new.order_number)
        returning id into v_wid;
      end if;
      update order_serials set warranty_id = v_wid where id = r.sid;
    end loop;
  end if;
  return null;
end;
$fn$;
drop trigger if exists orders_timeline on public.orders;
create trigger orders_timeline after update of order_status on public.orders
  for each row execute function public.pr_order_timeline();

revoke execute on function public.pr_order_lifecycle(), public.pr_order_timeline() from public, anon, authenticated;

-- agents may read the delivery timeline too
drop policy if exists delivery_timeline_agent_read on public.delivery_timeline;
create policy delivery_timeline_agent_read on public.delivery_timeline for select to authenticated using (public.is_agent());

-- backfill: step times for existing orders, from the best evidence there is
update public.orders set
  confirmed_at = coalesce(confirmed_at, case when order_status in ('confirmed', 'processing', 'packed', 'shipped', 'delivered')
                                             then coalesce(payment_verified_at, created_at) end),
  shipped_at   = coalesce(shipped_at, case when order_status in ('shipped', 'delivered') then updated_at end),
  delivered_at = coalesce(delivered_at, case when order_status = 'delivered'
                                             then coalesce(actual_delivery_date::timestamptz, updated_at) end)
where order_status <> 'pending' and (confirmed_at is null or (order_status in ('shipped', 'delivered') and shipped_at is null));

-- 5 ---------------------------------------------------------------------------
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
  v_existing   warranties%rowtype;
begin
  if v_name is null then raise exception 'Name is required' using errcode = 'P0001'; end if;
  if v_mobile is null or not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;
  if v_serial is null then raise exception 'Product serial number is required' using errcode = 'P0001'; end if;
  if v_purchase is not null and v_purchase > current_date then
    raise exception 'The purchase date cannot be in the future' using errcode = 'P0001';
  end if;

  -- the same serial is already registered (e.g. automatically on delivery): return that one
  select * into v_existing from warranties w
   where upper(w.serial_number) = upper(v_serial)
     and (v_product_id is null or w.product_id = v_product_id)
     and public.pr_norm_mobile(w.mobile) = public.pr_norm_mobile(v_mobile)
   order by w.created_at limit 1;
  if found then
    return jsonb_build_object('id', v_existing.id, 'warranty_number', v_existing.warranty_number,
                              'valid_until', v_existing.warranty_end_date, 'already_registered', true);
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
