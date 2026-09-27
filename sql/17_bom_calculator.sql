-- ============================================================================
-- PowerRun Industries - migration 17 / Battery BOM Cost Calculator (admin only)
--
-- Lets an admin price out a battery build component-by-component (cells,
-- BMS, busbars, contactors, enclosure, ...) and, optionally, push the
-- computed total straight into an existing product's purchase_cost - the
-- same field the Profit & Loss Calculator (migration 14) already reads.
--
-- Locked to public.is_admin() for every operation, same as every calc_*
-- table - no public/customer access anywhere.
--
-- Additive and idempotent. Safe to run more than once.
-- ============================================================================

create table if not exists public.bom_calculations (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  linked_product_id  uuid references public.products(id) on delete set null,
  items              jsonb not null default '[]'::jsonb,
  total_cost         numeric not null default 0,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists bom_calculations_linked_product_idx
  on public.bom_calculations(linked_product_id);

create or replace function public.bom_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bom_calculations_touch on public.bom_calculations;
create trigger bom_calculations_touch before update on public.bom_calculations
  for each row execute function public.bom_touch_updated_at();

alter table public.bom_calculations enable row level security;

do $do$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename = 'bom_calculations' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$do$;

create policy bom_calculations_admin_all on public.bom_calculations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.bom_calculations from anon, authenticated;
grant select, insert, update, delete on public.bom_calculations to authenticated;
