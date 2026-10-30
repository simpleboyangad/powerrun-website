-- Rollback for sql/46_payment_retry.sql (payment_events.error_reason is kept - it is data)
drop function if exists public.switch_order_to_cod(uuid, text);
