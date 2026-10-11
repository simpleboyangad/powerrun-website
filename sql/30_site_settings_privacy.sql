-- ============================================================================
-- PowerRun Industries - migration 30 / site_settings privacy
--
-- site_settings had one read policy, "using (true)", so anyone holding the
-- public (publishable) key could read EVERY row, including:
--
--   calc_defaults       profit/loss calculator purchase and selling defaults
--   quotation_defaults  internal quotation terms
--   company.bank_*      bank account name, number, IFSC and branch
--
-- The storefront only needs three rows: shipping and payments (checkout) and
-- company (address, GSTIN and PAN on customer invoices and in the
-- Organization schema written by scripts/seo_build.py). After this migration:
--
--   * visitors and customers read only shipping, payments and company;
--   * admins keep full access through site_settings_admin_write (unchanged);
--   * bank details move out of company into a new company_private row,
--     which only admins can read. assets/js/admin/settings.js saves them
--     there and quotations-print.js reads them from there.
--
-- SECURITY DEFINER functions that read quotation_defaults (migrations 24, 25)
-- run as their owner and are not affected.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

begin;

-- 1. Move bank details into the admin-only row ---------------------------------
insert into public.site_settings (key, value)
select 'company_private',
       jsonb_strip_nulls(jsonb_build_object(
         'bank_name',           value->'bank_name',
         'bank_account_name',   value->'bank_account_name',
         'bank_account_number', value->'bank_account_number',
         'bank_ifsc',           value->'bank_ifsc',
         'bank_branch',         value->'bank_branch'))
  from public.site_settings
 where key = 'company'
   and value ?| array['bank_name','bank_account_name','bank_account_number','bank_ifsc','bank_branch']
on conflict (key) do update
   set value = public.site_settings.value || excluded.value;

update public.site_settings
   set value = value - 'bank_name' - 'bank_account_name' - 'bank_account_number'
                     - 'bank_ifsc' - 'bank_branch'
 where key = 'company';

-- 2. Public read limited to the rows the storefront uses ------------------------
drop policy if exists site_settings_public_read on public.site_settings;

create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated
  using (key in ('shipping', 'payments', 'company'));

-- site_settings_admin_write (for all to authenticated, using is_admin())
-- from 03_rls.sql still gives admins every row, company_private included.

commit;
