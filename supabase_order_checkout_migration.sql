-- PowerRun public website checkout: run once in Supabase SQL Editor.
-- It preserves existing data and does not expose a service-role key.
-- The function recalculates every price from active products, so browser totals
-- cannot be manipulated before orders and order_items are written.

-- Required for signed-in customers' order history. Anonymous visitors can still
-- submit an order, but never gain SELECT access to orders.
alter table public.orders add column if not exists user_id uuid references auth.users(id) on delete set null;

create or replace function public.create_website_order(
  p_customer jsonb,
  p_items jsonb
)
returns table(order_id uuid, order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_total numeric;
  v_user_id uuid := auth.uid();
begin
  if coalesce(trim(p_customer->>'name'), '') = ''
     or coalesce(trim(p_customer->>'mobile'), '') = '' then
    raise exception 'Name and mobile are required';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one product is required';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
    left join products p on p.id = requested.product_id and p.is_active = true
    where requested.product_id is null
       or requested.quantity is null
       or requested.quantity < 1
       or p.id is null
       or p.price is null
  ) then
    raise exception 'One or more products are unavailable or have no price';
  end if;

  select sum(p.price * requested.quantity)
    into v_total
  from jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
  join products p on p.id = requested.product_id and p.is_active = true;

  v_order_number := 'PR-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS') || '-' || floor(random() * 900 + 100)::text;

  insert into orders (
    order_number, user_id, customer_name, customer_mobile, customer_email,
    address, city, state, pincode, subtotal, total_amount,
    payment_status, order_status, payment_method
  ) values (
    v_order_number, v_user_id, trim(p_customer->>'name'), trim(p_customer->>'mobile'),
    nullif(trim(p_customer->>'email'), ''), nullif(trim(p_customer->>'address'), ''),
    nullif(trim(p_customer->>'city'), ''), nullif(trim(p_customer->>'state'), ''),
    nullif(trim(p_customer->>'pincode'), ''), v_total, v_total,
    'pending', 'new', 'enquiry'
  ) returning id into v_order_id;

  insert into order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
  select v_order_id, p.id, p.name, requested.quantity, p.price, p.price * requested.quantity
  from jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
  join products p on p.id = requested.product_id and p.is_active = true;

  return query select v_order_id, v_order_number;
end;
$$;

-- The website uses the function above instead of direct table inserts.
grant execute on function public.create_website_order(jsonb, jsonb) to anon, authenticated;

-- This is deliberately authenticated-only and limited to a matching user_id;
-- it does not grant public SELECT access to orders.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'orders'
      and policyname = 'authenticated_users_read_own_orders'
  ) then
    create policy authenticated_users_read_own_orders on public.orders
      for select to authenticated using (user_id = auth.uid());
  end if;
end;
$$;
