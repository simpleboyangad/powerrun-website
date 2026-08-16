-- ============================================================
-- Migration: add MRP (list price) column to products
-- Safe to run multiple times. Does not touch existing data.
-- Run this in Supabase SQL editor.
-- ============================================================

alter table public.products
  add column if not exists mrp numeric;

comment on column public.products.mrp is
  'Optional list/MRP price. When set higher than price, the storefront shows a strikethrough MRP and a discount %. Leave NULL to show only the selling price.';

-- Example: set MRP for a specific product by SKU (edit values, then run manually)
-- update public.products set mrp = 266500 where sku = 'MGLIBATT512300';

-- ------------------------------------------------------------
-- Optional: structured specification rows (for the new spec table
-- on the product detail page). The existing free-text specifications
-- (jsonb: {"text": "..."}) still works and is used as a fallback.
-- To switch a product to the structured table format, set
-- specifications to: {"rows":[{"label":"Nominal voltage","value":"51.2 V"},
--                              {"label":"Capacity","value":"300 Ah · ≈15.4 kWh"}]}
-- Example:
-- update public.products
--   set specifications = jsonb_build_object('rows', jsonb_build_array(
--     jsonb_build_object('label','Nominal voltage','value','51.2 V'),
--     jsonb_build_object('label','Capacity','value','300 Ah · ≈15.4 kWh'),
--     jsonb_build_object('label','Chemistry','value','LiFePO4 (Lithium Iron Phosphate)'),
--     jsonb_build_object('label','BMS','value','Smart BMS — overcharge / over-discharge / short-circuit protection'),
--     jsonb_build_object('label','Warranty','value','5-year full hardware warranty')
--   ))
--   where sku = 'PR-011';
