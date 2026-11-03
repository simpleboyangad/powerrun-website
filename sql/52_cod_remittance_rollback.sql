-- rollback for 52_cod_remittance.sql
drop index if exists public.orders_cod_open_idx;
alter table public.orders drop column if exists cod_remitted_at, drop column if exists cod_remitted_amount,
  drop column if exists cod_remit_ref;
