-- 52: COD remittance - has the courier's cash reached the bank?
--
-- Shiprocket collects the COD balance on delivery and pays it to the bank a few days
-- later in batches (remittances, each with a UTR / CRF reference). Admin > COD Hisaab
-- marks each delivered COD order received, by hand or from Shiprocket's remittance
-- report (CSV, matched on the AWB).
-- Rollback: sql/52_cod_remittance_rollback.sql

alter table public.orders add column if not exists cod_remitted_at     date;
alter table public.orders add column if not exists cod_remitted_amount numeric check (cod_remitted_amount is null or cod_remitted_amount >= 0);
alter table public.orders add column if not exists cod_remit_ref       text check (cod_remit_ref is null or length(cod_remit_ref) <= 80);
create index if not exists orders_cod_open_idx on public.orders (delivered_at)
  where cod_to_collect > 0 and cod_remitted_at is null;
