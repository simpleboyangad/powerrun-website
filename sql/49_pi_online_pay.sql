-- 49: pay a Proforma Invoice online (Razorpay) from the PI link
--
-- The PI page (/pi/?t=<pi_token>) had only UPI / bank details. pi_start_online_payment()
-- lets the holder of the PI link pay through Razorpay: the advance (advance_percent of the
-- total, the rest on delivery) or the full amount. It only prepares the order - the amount
-- is still read from the orders row by razorpay-create-order, and razorpay-verify-payment /
-- the webhook record it exactly as for a checkout payment:
--   advance -> payment_method 'advance_cod' + advance_required
--   full    -> payment_method 'razorpay'
-- Only while nothing has been received yet (advance_amount = 0); a part-paid order is
-- settled by UPI / bank or on delivery.

create or replace function public.pi_start_online_payment(p_token uuid, p_full boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v orders%rowtype;
  v_pay jsonb := coalesce((select value from site_settings where key = 'payments'), '{}'::jsonb);
  v_pct numeric := least(greatest(coalesce(nullif(v_pay->>'advance_percent', '')::numeric, 50), 1), 100);
  v_below numeric := greatest(coalesce(nullif(v_pay->>'full_online_below', '')::numeric, 0), 0);
  v_adv numeric;
begin
  select * into v from orders where pi_token = p_token for update;
  if not found then
    raise exception 'This PI link is not valid' using errcode = 'P0001';
  end if;
  if v.order_status in ('cancelled', 'delivered') then
    raise exception 'This order can not be paid online - please call or WhatsApp us' using errcode = 'P0001';
  end if;
  if v.payment_status = 'paid' then
    return jsonb_build_object('order_number', v.order_number, 'status', 'already_paid');
  end if;
  if coalesce(v.advance_amount, 0) > 0 then
    raise exception 'Advance already received - the rest is paid on delivery' using errcode = 'P0001';
  end if;

  if p_full then
    update orders set payment_method = 'razorpay',
           notes = case when v.payment_method = 'razorpay' then notes
                        else trim(coalesce(notes, '') || ' [Customer chose full online payment from the PI]') end
     where id = v.id;
  else
    if coalesce((v_pay->>'advance_enabled')::boolean, true) is false or v.total_amount < v_below then
      raise exception 'This order has to be paid fully online' using errcode = 'P0001';
    end if;
    v_adv := case when v.advance_required > 0 and v.advance_required < v.total_amount then v.advance_required
                  else least(ceil(v.total_amount * v_pct / 100), v.total_amount) end;
    update orders set payment_method = 'advance_cod', advance_required = v_adv,
           notes = case when v.payment_method = 'advance_cod' then notes
                        else trim(coalesce(notes, '') || ' [Customer chose ' || v_pct || '% advance online from the PI]') end
     where id = v.id;
  end if;

  select * into v from orders where id = v.id;
  return jsonb_build_object(
    'order_id', v.id, 'order_number', v.order_number,
    'payment_method', v.payment_method,
    'amount', case when v.payment_method = 'advance_cod' then v.advance_required else v.total_amount end,
    'status', 'ready');
end;
$fn$;
revoke execute on function public.pi_start_online_payment(uuid, boolean) from public;
grant execute on function public.pi_start_online_payment(uuid, boolean) to anon, authenticated;
