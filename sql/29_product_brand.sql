-- ============================================================================
-- PowerRun Industries - migration 29 / product brand
--
-- PowerRun now resells other makers' parts (JK BMS first). Those products
-- must carry their real brand in the page schema, analytics and the Merchant
-- Center feed; calling them "PowerRun" would misstate who makes them.
--
--   products.brand  null = PowerRun's own product (every existing row)
--
-- Additive and idempotent.
-- ============================================================================

alter table public.products add column if not exists brand text;

comment on column public.products.brand is
  'Maker of a resold product (e.g. JK BMS). Null means a PowerRun product.';
