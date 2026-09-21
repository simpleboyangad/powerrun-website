-- ============================================================================
-- PowerRun Industries - migration 14 / Profit & Loss Calculator (admin only)
--
-- A new section of the EXISTING admin panel. Every table here is locked to
-- public.is_admin() for every operation - unlike the SEO tables, there is no
-- public-read branch anywhere: cost and margin data must never reach an
-- unauthenticated or non-admin client.
--
--   calc_gst_rates       admin-managed GST rate list (0/5/12/18/28 seeded)
--   calc_selling_channels admin-managed channels (Website/Amazon/Dealer/...)
--   calc_target_margins  admin-managed target profit % presets
--   calc_history         every saved calculation, with its computed result
--                        stored (not recomputed on every list read)
--   calc_audit_log       who changed a default/rate/channel, old -> new
--   products              5 new nullable purchase-side costing columns
--   site_settings         new 'calc_defaults' row (purchase/selling defaults)
--
-- Additive and idempotent. Safe to run more than once. Nothing existing is
-- dropped, renamed or overwritten.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PRODUCTS : purchase / landed-cost side (selling side already exists:
--    price, mrp, gst_rate, price_includes_gst, hsn_code)
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists purchase_cost         numeric;
alter table public.products add column if not exists purchase_gst_rate     numeric;
alter table public.products add column if not exists default_freight       numeric;
alter table public.products add column if not exists default_packaging_cost numeric;
alter table public.products add column if not exists default_other_cost    numeric;

-- ---------------------------------------------------------------------------
-- 2. GST RATE MANAGEMENT
-- ---------------------------------------------------------------------------
create table if not exists public.calc_gst_rates (
  id         uuid primary key default gen_random_uuid(),
  rate       numeric not null,
  label      text,
  is_default boolean not null default false,
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. SELLING CHANNELS (marketplace / payment charges per channel)
-- ---------------------------------------------------------------------------
create table if not exists public.calc_selling_channels (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  commission_pct      numeric not null default 0,
  payment_gateway_pct numeric not null default 0,
  fixed_fee           numeric not null default 0,
  shipping_cost       numeric not null default 0,
  cod_fee             numeric not null default 0,
  other_charges       numeric not null default 0,
  is_default          boolean not null default false,
  is_active           boolean not null default true,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. TARGET PROFIT PRESETS
-- ---------------------------------------------------------------------------
create table if not exists public.calc_target_margins (
  id         uuid primary key default gen_random_uuid(),
  label      text,
  percent    numeric not null,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. CALCULATION HISTORY
-- ---------------------------------------------------------------------------
create sequence if not exists public.pr_calc_number_seq start with 1;

create table if not exists public.calc_history (
  id                    uuid primary key default gen_random_uuid(),
  calc_number           text not null,

  -- product (optional - a calculation may be ad-hoc, and must survive the
  -- product it referenced being edited or removed later)
  product_id            uuid references public.products(id) on delete set null,
  product_name_snapshot text,
  sku_snapshot          text,
  category_snapshot     text,
  quantity              numeric not null default 1,

  -- selling channel (optional, same survive-deletion reasoning)
  selling_channel_id    uuid references public.calc_selling_channels(id) on delete set null,
  channel_name_snapshot text,

  -- purchase side
  purchase_price        numeric not null default 0,
  purchase_gst_rate      numeric not null default 0,
  freight                numeric not null default 0,
  packaging_cost         numeric not null default 0,
  loading_unloading      numeric not null default 0,
  labour_cost            numeric not null default 0,
  manufacturing_cost     numeric not null default 0,
  warranty_provision     numeric not null default 0,
  other_purchase_cost    numeric not null default 0,

  -- selling side
  selling_price          numeric not null default 0,
  discount                numeric not null default 0,
  sales_gst_rate          numeric not null default 0,
  commission_pct          numeric not null default 0,
  payment_gateway_pct     numeric not null default 0,
  dealer_commission_pct   numeric not null default 0,
  shipping_cost           numeric not null default 0,
  cod_charge              numeric not null default 0,
  marketing_cost          numeric not null default 0,
  rto_provision_pct       numeric not null default 0,
  other_selling_cost      numeric not null default 0,

  -- computed result, stored as calculated (per unit unless noted)
  total_landed_cost      numeric not null default 0,
  net_sales              numeric not null default 0,
  total_cost              numeric not null default 0,   -- landed cost + expenses, x quantity
  total_sales              numeric not null default 0,  -- net sales x quantity
  gross_profit            numeric not null default 0,
  net_profit               numeric not null default 0,
  profit_per_unit          numeric not null default 0,
  profit_percent           numeric not null default 0,
  margin_percent            numeric not null default 0,
  roi_percent                numeric not null default 0,
  breakeven_price             numeric not null default 0,
  is_loss boolean generated always as (net_profit < 0) stored,

  notes                  text,
  created_by              uuid references auth.users(id) on delete set null,
  created_by_name         text,
  created_at               timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists calc_history_created_at_idx on public.calc_history(created_at desc);
create index if not exists calc_history_product_id_idx on public.calc_history(product_id);
create index if not exists calc_history_is_loss_idx    on public.calc_history(is_loss);
create unique index if not exists calc_history_number_key on public.calc_history(calc_number);

-- ---------------------------------------------------------------------------
-- 6. AUDIT LOG (settings changes only - written from the app, not a trigger,
--    matching the rest of the codebase which has no business-logic triggers
--    beyond updated_at)
-- ---------------------------------------------------------------------------
create table if not exists public.calc_audit_log (
  id               uuid primary key default gen_random_uuid(),
  admin_user_id    uuid references auth.users(id) on delete set null,
  admin_name_snapshot text,
  setting_type     text not null,   -- gst_rate | selling_channel | target_margin | default_settings
  setting_label    text not null,   -- e.g. "Marketplace Commission"
  old_value        text,
  new_value        text,
  created_at       timestamptz not null default now()
);

create index if not exists calc_audit_log_created_at_idx on public.calc_audit_log(created_at desc);

-- ---------------------------------------------------------------------------
-- 7. site_settings default row (purchase/selling defaults)
-- ---------------------------------------------------------------------------
insert into public.site_settings (key, value) values (
  'calc_defaults',
  '{
    "purchase_gst_rate": 18, "freight": 0, "packaging_cost": 0, "loading_unloading": 0,
    "labour_cost": 0, "manufacturing_cost": 0, "warranty_provision": 0, "other_purchase_cost": 0,
    "sales_gst_rate": 18, "commission_pct": 0, "payment_gateway_pct": 2, "dealer_commission_pct": 0,
    "shipping_cost": 0, "cod_charge": 0, "marketing_cost": 0, "rto_provision_pct": 0, "other_selling_cost": 0
  }'::jsonb
) on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 8. updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.calc_touch_updated_at()
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

drop trigger if exists calc_selling_channels_touch on public.calc_selling_channels;
create trigger calc_selling_channels_touch before update on public.calc_selling_channels
  for each row execute function public.calc_touch_updated_at();

drop trigger if exists calc_history_touch on public.calc_history;
create trigger calc_history_touch before update on public.calc_history
  for each row execute function public.calc_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 9. RLS : admin only, every operation, no public/customer access at all
-- ---------------------------------------------------------------------------
alter table public.calc_gst_rates       enable row level security;
alter table public.calc_selling_channels enable row level security;
alter table public.calc_target_margins   enable row level security;
alter table public.calc_history          enable row level security;
alter table public.calc_audit_log        enable row level security;

do $do$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in
             ('calc_gst_rates', 'calc_selling_channels', 'calc_target_margins',
              'calc_history', 'calc_audit_log') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$do$;

create policy calc_gst_rates_admin_all on public.calc_gst_rates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy calc_selling_channels_admin_all on public.calc_selling_channels
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy calc_target_margins_admin_all on public.calc_target_margins
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy calc_history_admin_all on public.calc_history
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy calc_audit_log_admin_all on public.calc_audit_log
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.calc_gst_rates, public.calc_selling_channels, public.calc_target_margins,
  public.calc_history, public.calc_audit_log from anon, authenticated;
grant select, insert, update, delete on public.calc_gst_rates, public.calc_selling_channels,
  public.calc_target_margins, public.calc_history, public.calc_audit_log to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Reference-number generator, callable directly by an admin. pr_next_number
--    itself is revoked from authenticated (sql/07_harden_functions.sql), so
--    every caller goes through a thin admin-checked wrapper like this one.
-- ---------------------------------------------------------------------------
create or replace function public.calc_next_number()
returns text
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return public.pr_next_number('public.pr_calc_number_seq', 'PRC');
end;
$fn$;

revoke execute on function public.calc_next_number() from public, anon;
grant execute on function public.calc_next_number() to authenticated;

-- ---------------------------------------------------------------------------
-- 11. SEED : only fills if the table is empty (never overwrites admin edits)
-- ---------------------------------------------------------------------------
insert into public.calc_gst_rates (rate, label, is_default, sort_order)
select * from (values
  (0::numeric,  '0%',  false, 1),
  (5::numeric,  '5%',  false, 2),
  (12::numeric, '12%', false, 3),
  (18::numeric, '18%', true,  4),
  (28::numeric, '28%', false, 5)
) as v(rate, label, is_default, sort_order)
where not exists (select 1 from public.calc_gst_rates);

insert into public.calc_selling_channels (name, commission_pct, payment_gateway_pct, is_default, sort_order)
select 'Direct Website', 0, 2, true, 1
where not exists (select 1 from public.calc_selling_channels);

insert into public.calc_target_margins (label, percent, is_default, sort_order)
select * from (values
  ('5%',  5::numeric,  false, 1),
  ('10%', 10::numeric, false, 2),
  ('15%', 15::numeric, false, 3),
  ('20%', 20::numeric, true,  4),
  ('25%', 25::numeric, false, 5)
) as v(label, percent, is_default, sort_order)
where not exists (select 1 from public.calc_target_margins);
