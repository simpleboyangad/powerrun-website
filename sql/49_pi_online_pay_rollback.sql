-- rollback for 49_pi_online_pay.sql
drop function if exists public.pi_start_online_payment(uuid, boolean);
