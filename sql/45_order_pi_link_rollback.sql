-- Rollback for sql/45_order_pi_link.sql: the public PI link stops working at once.
-- The pi_token / pi_viewed_at columns are kept (data).
drop function if exists public.get_order_pi_public(uuid);
