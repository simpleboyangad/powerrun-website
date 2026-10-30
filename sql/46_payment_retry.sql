-- =============================================================================
-- PowerRun Industries - migration 46: online payment fixes (owner request 2026-10-30)
--
-- 10 customers chose "Pay Online" and none paid; 6 then placed a second, COD order.
--   * payment_events.error_reason: the webhook now stores Razorpay's failure reason
--     (e.g. "payment_timed_out", "Payment was cancelled by the customer").
--   * switch_order_to_cod(order id, mobile): the customer who just closed the payment
--     window can turn the SAME order into cash on delivery instead of placing a second
--     one. Only for their own unpaid online order, still pending, at most 2 days old.
-- Rollback: sql/46_payment_retry_rollback.sql
-- =============================================================================

alter table public.payment_events add column if not exists error_reason text;

create or replace function public.switch_order_to_cod(p_order_id uuid, p_mobile text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v orders%rowtype;
begin
  select * into v from orders where id = p_order_id for update;
  if not found or public.pr_norm_mobile(v.customer_mobile) <> public.pr_norm_mobile(p_mobile) then
    raise exception 'Order not found' using errcode = 'P0001';
  end if;
  if v.payment_status = 'paid' then
    return jsonb_build_object('order_number', v.order_number, 'status', 'already_paid');
  end if;
  if v.payment_method is distinct from 'razorpay' or v.order_status <> 'pending'
     or v.created_at < now() - interval '2 days' then
    raise exception 'This order can no longer be changed - please call or WhatsApp us' using errcode = 'P0001';
  end if;
  update orders set payment_method = 'cod',
         notes = trim(coalesce(notes, '') || ' [Customer switched from online payment to COD]')
   where id = v.id;
  return jsonb_build_object('order_number', v.order_number, 'status', 'cod');
end;
$fn$;
revoke execute on function public.switch_order_to_cod(uuid, text) from public;
grant execute on function public.switch_order_to_cod(uuid, text) to anon, authenticated;
