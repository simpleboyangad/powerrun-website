-- ============================================================================
-- PowerRun Industries - migration 31 / product costs out of the public table
--
-- products is readable by anyone holding the public (publishable) key - the
-- storefront needs it. Migration 14 added the buying-side columns to it:
--
--   purchase_cost, purchase_gst_rate, default_freight,
--   default_packaging_cost, default_other_cost
--
-- so the moment the BOM or profit calculator filled them in, every visitor
-- could read PowerRun's buying cost and margin. (All were still empty when
-- this was found on 2026-10-12.)
--
-- After this migration the five values live in product_costs, one row per
-- product, readable and writable only by admins. assets/js/admin/products.js,
-- calculator.js and bom.js read and write them there.
--
-- Additive first (create + copy), then the columns are dropped. Idempotent.
-- ============================================================================

create table if not exists public.product_costs (
  product_id             uuid primary key references public.products(id) on delete cascade,
  purchase_cost          numeric,
  purchase_gst_rate      numeric,
  default_freight        numeric,
  default_packaging_cost numeric,
  default_other_cost     numeric,
  updated_at             timestamptz not null default now()
);

alter table public.product_costs enable row level security;

drop policy if exists product_costs_admin_all on public.product_costs;
create policy product_costs_admin_all on public.product_costs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.product_costs from anon, authenticated;
grant select, insert, update, delete on public.product_costs to authenticated;

-- copy whatever was stored, then drop the public columns
do $do$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'products' and column_name = 'purchase_cost') then
    insert into public.product_costs (product_id, purchase_cost, purchase_gst_rate, default_freight,
                                      default_packaging_cost, default_other_cost)
    select id, purchase_cost, purchase_gst_rate, default_freight, default_packaging_cost, default_other_cost
      from public.products
     where coalesce(purchase_cost, purchase_gst_rate, default_freight,
                    default_packaging_cost, default_other_cost) is not null
    on conflict (product_id) do nothing;
  end if;
end
$do$;

alter table public.products drop column if exists purchase_cost;
alter table public.products drop column if exists purchase_gst_rate;
alter table public.products drop column if exists default_freight;
alter table public.products drop column if exists default_packaging_cost;
alter table public.products drop column if exists default_other_cost;
