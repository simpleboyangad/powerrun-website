-- Rollback for sql/35_phase2_hardening.sql
-- Restores the previous behaviour. The legacy 3-argument create_website_order is not
-- re-created automatically: if it is ever needed, re-run its definition from
-- sql/26_order_shipping_address.sql (nothing on the website calls it).

do $do$
declare t text;
begin
  foreach t in array array['products', 'orders', 'coupons', 'site_settings', 'product_costs',
                           'admin_users', 'quotations', 'proforma_invoices'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
  end loop;
end;
$do$;
drop function if exists public.pr_audit();
-- keep public.audit_log (history); drop it manually only if really wanted:
-- drop table if exists public.audit_log;

drop trigger if exists leads_rate_limit on public.leads;
drop trigger if exists dealer_enquiries_rate_limit on public.dealer_enquiries;
drop trigger if exists service_tickets_rate_limit on public.service_tickets;
drop trigger if exists warranties_rate_limit on public.warranties;
drop trigger if exists quotations_rate_limit on public.quotations;
drop function if exists public.pr_public_rate_limit();

update storage.buckets set allowed_mime_types = null, file_size_limit = null where id = 'product-images';

alter function public.pr_current_fy_short() reset search_path;
alter function public.pr_freeze_issued_pi() reset search_path;
