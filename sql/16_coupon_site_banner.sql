-- ============================================================================
-- PowerRun Industries - migration 16 / public coupon banner
--
-- Lets the admin mark ONE coupon to be publicly announced (a site-wide
-- banner), instead of every coupon being a "secret" code only shared
-- privately. Purely additive: does not touch create_website_order(),
-- preview_coupon(), or any pricing/GST logic.
--
--   coupons.show_on_site   admin opt-in per coupon (default false - a coupon
--                          stays private unless explicitly marked public)
--   coupons.banner_text    optional custom marketing line; falls back to an
--                          auto-generated one if left blank
--   active_site_banner_coupon()   read-only, anon+authenticated, returns the
--                          single most recent public/active/in-date coupon
--                          (or null) - never exposes ids, usage counts or
--                          any other coupon internals.
-- ============================================================================

alter table public.coupons add column if not exists show_on_site boolean not null default false;
alter table public.coupons add column if not exists banner_text  text;

create or replace function public.active_site_banner_coupon()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_coupon coupons%rowtype;
begin
  select * into v_coupon from coupons
   where show_on_site = true
     and is_active = true
     and (valid_from is null or now() >= valid_from)
     and (valid_until is null or now() <= valid_until)
     and (usage_limit is null or usage_count < usage_limit)
   order by created_at desc
   limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'code', v_coupon.code,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value,
    'min_order_amount', v_coupon.min_order_amount,
    'banner_text', v_coupon.banner_text
  );
end;
$fn$;

revoke execute on function public.active_site_banner_coupon() from public;
grant execute on function public.active_site_banner_coupon() to anon, authenticated;
