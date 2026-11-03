-- 50: Shiprocket shipping from Admin > Orders ("Ship karo")
--
-- 1. products: the shipping box (weight + size, remembered per product) and
--    ship_surface_only for lithium batteries (only road couriers are offered).
-- 2. orders: the Shiprocket order / shipment ids, AWB, label, COD to collect and
--    the courier's last status. courier_partner / tracking_number stay the fields
--    the customer sees on Track Order.
-- 3. shiprocket_tokens: the Shiprocket API token cache (Edge Function only).
-- 4. courier_events + pr_record_courier_event(): tracking updates from the
--    Shiprocket webhook (supabase/functions/courier-webhook) move the order to
--    shipped / delivered and flag RTO. Each event is applied once.
--
-- The Edge Function supabase/functions/shiprocket does the API calls; it checks
-- that the caller is an admin (is_admin(), so the 2-step login applies).
-- Rollback: sql/50_shiprocket_rollback.sql

-- 1 ---------------------------------------------------------------------------
alter table public.products add column if not exists ship_weight_kg   numeric check (ship_weight_kg is null or ship_weight_kg > 0);
alter table public.products add column if not exists ship_length_cm   numeric check (ship_length_cm is null or ship_length_cm > 0);
alter table public.products add column if not exists ship_breadth_cm  numeric check (ship_breadth_cm is null or ship_breadth_cm > 0);
alter table public.products add column if not exists ship_height_cm   numeric check (ship_height_cm is null or ship_height_cm > 0);
alter table public.products add column if not exists ship_surface_only boolean not null default false;

-- lithium battery packs go by road only
update public.products p set ship_surface_only = true
 where not p.ship_surface_only
   and exists (select 1 from public.categories c
                where c.id in (p.category_id, p.subcategory_id)
                  and c.slug in ('lithium-batteries', 'e-rickshaw-batteries', 'ev-batteries'));

-- 2 ---------------------------------------------------------------------------
alter table public.orders add column if not exists sr_order_id     bigint;
alter table public.orders add column if not exists sr_shipment_id  bigint;
alter table public.orders add column if not exists awb_code        text;
alter table public.orders add column if not exists label_url       text;
alter table public.orders add column if not exists cod_to_collect  numeric;
alter table public.orders add column if not exists ship_charge     numeric;
alter table public.orders add column if not exists ship_status     text;
alter table public.orders add column if not exists ship_status_at  timestamptz;
alter table public.orders add column if not exists ship_booked_at  timestamptz;
alter table public.orders add column if not exists rto             boolean not null default false;
create unique index if not exists orders_awb_code_key on public.orders (awb_code) where awb_code is not null;

-- 3 ---------------------------------------------------------------------------
create table if not exists public.shiprocket_tokens (
  id          integer primary key default 1 check (id = 1),
  token       text not null,
  expires_at  timestamptz not null,
  updated_at  timestamptz not null default now()
);
alter table public.shiprocket_tokens enable row level security;
revoke all on public.shiprocket_tokens from anon, authenticated;   -- service role only

-- 4 ---------------------------------------------------------------------------
create table if not exists public.courier_events (
  id          bigserial primary key,
  event_key   text not null unique,
  order_id    uuid references public.orders(id) on delete set null,
  awb_code    text,
  status      text,
  status_at   timestamptz,
  payload     jsonb,
  result      text,
  created_at  timestamptz not null default now()
);
create index if not exists courier_events_order_idx on public.courier_events (order_id, created_at);
alter table public.courier_events enable row level security;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'courier_events' loop
    execute format('drop policy %I on public.courier_events', r.policyname);
  end loop;
end $$;
create policy courier_events_admin_read on public.courier_events for select to authenticated using (public.is_admin());
revoke all on public.courier_events from anon, authenticated;
grant select on public.courier_events to authenticated;

-- Shiprocket status text -> what happens to the order:
--   picked up / in transit / out for delivery ... -> shipped
--   delivered                                    -> delivered (+ COD/advance order paid: the
--                                                   courier collected the rest)
--   rto ...                                      -> rto flag + note, status unchanged
--   cancelled                                    -> shipment fields cleared (book again)
create or replace function public.pr_record_courier_event(
  p_event_key text, p_awb text, p_order_number text, p_status text,
  p_status_at timestamptz, p_payload jsonb)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v orders%rowtype;
  s text := upper(coalesce(trim(p_status), ''));
  v_result text;
begin
  if p_event_key is null or s = '' then return 'ignored'; end if;
  if exists (select 1 from courier_events where event_key = p_event_key) then return 'duplicate'; end if;

  select * into v from orders where awb_code is not null and awb_code = nullif(trim(p_awb), '') for update;
  if not found and nullif(trim(p_order_number), '') is not null then
    select * into v from orders where order_number = trim(p_order_number) and awb_code is not null for update;
  end if;
  if not found then
    insert into courier_events (event_key, awb_code, status, status_at, payload, result)
    values (p_event_key, p_awb, s, p_status_at, p_payload, 'no_order');
    return 'no_order';
  end if;

  update orders set ship_status = s, ship_status_at = coalesce(p_status_at, now()) where id = v.id;

  if s like '%RTO%' then
    update orders set rto = true,
           notes = trim(coalesce(notes, '') || ' [Courier: ' || s || ' ' || to_char(now() at time zone 'Asia/Kolkata', 'DD Mon') || ']')
     where id = v.id and not rto;
    v_result := 'rto';
  elsif s = 'DELIVERED' then
    if v.order_status not in ('delivered', 'cancelled') then
      update orders set order_status = 'delivered',
             payment_status = case when payment_method in ('cod', 'advance_cod') then 'paid' else payment_status end
       where id = v.id;
    end if;
    v_result := 'delivered';
  elsif s in ('CANCELED', 'CANCELLED') then
    if v.order_status not in ('shipped', 'delivered') then
      update orders set awb_code = null, label_url = null, sr_order_id = null, sr_shipment_id = null,
             courier_partner = null, tracking_number = null, cod_to_collect = null, ship_charge = null,
             order_status = case when order_status = 'packed' then 'confirmed' else order_status end
       where id = v.id;
    end if;
    v_result := 'cancelled';
  elsif s in ('PICKED UP', 'SHIPPED', 'OUT FOR DELIVERY') or s like '%TRANSIT%' or s like 'REACHED%' then
    if v.order_status in ('pending', 'confirmed', 'processing', 'packed') then
      update orders set order_status = 'shipped' where id = v.id;
    end if;
    v_result := 'shipped';
  else
    v_result := 'noted';
  end if;

  if s in ('OUT FOR DELIVERY') then
    insert into delivery_timeline (order_id, status, status_date, description)
    values (v.id, 'shipped', coalesce(p_status_at, now()), 'Out for delivery');
  end if;

  insert into courier_events (event_key, order_id, awb_code, status, status_at, payload, result)
  values (p_event_key, v.id, p_awb, s, p_status_at, p_payload, v_result);
  return v_result;
end;
$fn$;
revoke execute on function public.pr_record_courier_event(text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
