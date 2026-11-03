-- 51: courier tracking for parcels booked straight in the Shiprocket app
--
-- pr_record_courier_event() (migration 50) found an order only by its AWB, which
-- Admin > Ship karo saves. When the label is made in the Shiprocket app and only the
-- Tracking Number is typed into the order, the update now matches that number too
-- and stores it as the AWB. Everything else is unchanged from migration 50.
-- Rollback: re-run the function from sql/50_shiprocket.sql

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
  -- booked in the Shiprocket app and only the tracking number typed in Admin: link it now
  if not found and nullif(trim(p_awb), '') is not null then
    select * into v from orders
     where awb_code is null and order_status <> 'cancelled' and upper(trim(tracking_number)) = upper(trim(p_awb))
     order by created_at desc limit 1 for update;
    if found then
      update orders set awb_code = trim(tracking_number) where id = v.id;
      v.awb_code := trim(v.tracking_number);
    end if;
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
