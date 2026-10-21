-- =============================================================================
-- PowerRun Industries - migration 35 / Phase 2 security hardening
-- (docs/automation/SECURITY_REVIEW.md S4, S5, S6, S9 + generic audit log)
--
-- 1. Fixed search_path on the two helper functions from migration 34 (S6).
-- 2. Drop the legacy 3-argument create_website_order (S4). The checkout always
--    calls the 4-argument version (with p_coupon_code).
-- 3. product-images bucket: JPEG / PNG / WebP only, 10 MB per file (S9).
-- 4. Rate limit on the public forms (S5): contact / quote / dealer / service /
--    warranty rows. Per mobile: at most 3 in 10 minutes; per table: at most 50 in
--    10 minutes. Admins are never limited. Implemented as BEFORE INSERT triggers so
--    the public submit_* functions stay byte-identical.
-- 5. audit_log: who changed what (before/after of changed columns) on products,
--    orders, coupons, site_settings, product_costs, admin_users, quotations and
--    proforma_invoices. Admin-only read; nobody can write it directly.
--
-- Idempotent. Rollback: sql/35_phase2_hardening_rollback.sql
-- =============================================================================

-- 1 ---------------------------------------------------------------------------
alter function public.pr_current_fy_short() set search_path = public;
alter function public.pr_freeze_issued_pi() set search_path = public;

-- 2 ---------------------------------------------------------------------------
drop function if exists public.create_website_order(jsonb, jsonb, text);

-- 3 ---------------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'],
       file_size_limit = 10485760
 where id = 'product-images';

-- 4 ---------------------------------------------------------------------------
create or replace function public.pr_public_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_col    text := tg_argv[0];                 -- mobile column of this table
  v_mobile text;
  v_same   integer;
  v_all    integer;
begin
  if public.is_admin() then
    return new;
  end if;
  v_mobile := public.pr_norm_mobile(to_jsonb(new) ->> v_col);

  execute format('select count(*) from public.%I where created_at > now() - interval ''10 minutes''', tg_table_name)
     into v_all;
  if v_all >= 50 then
    raise exception 'Too many requests right now. Please try again in a few minutes or WhatsApp us.'
      using errcode = 'P0001';
  end if;

  if coalesce(v_mobile, '') <> '' then
    execute format('select count(*) from public.%I where created_at > now() - interval ''10 minutes''
                      and public.pr_norm_mobile(%I) = $1', tg_table_name, v_col)
       into v_same using v_mobile;
    if v_same >= 3 then
      raise exception 'We already have your request. Please wait a few minutes before sending it again.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$fn$;

revoke execute on function public.pr_public_rate_limit() from public, anon, authenticated;

drop trigger if exists leads_rate_limit on public.leads;
create trigger leads_rate_limit before insert on public.leads
  for each row execute function public.pr_public_rate_limit('mobile');
drop trigger if exists dealer_enquiries_rate_limit on public.dealer_enquiries;
create trigger dealer_enquiries_rate_limit before insert on public.dealer_enquiries
  for each row execute function public.pr_public_rate_limit('mobile');
drop trigger if exists service_tickets_rate_limit on public.service_tickets;
create trigger service_tickets_rate_limit before insert on public.service_tickets
  for each row execute function public.pr_public_rate_limit('mobile');
drop trigger if exists warranties_rate_limit on public.warranties;
create trigger warranties_rate_limit before insert on public.warranties
  for each row execute function public.pr_public_rate_limit('mobile');
drop trigger if exists quotations_rate_limit on public.quotations;
create trigger quotations_rate_limit before insert on public.quotations
  for each row execute function public.pr_public_rate_limit('customer_mobile');

-- 5 ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  table_name  text not null,
  row_id      text,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor       uuid,                 -- auth.uid() when a signed-in user did it
  actor_role  text,                 -- anon / authenticated / service_role / postgres
  changed     jsonb                 -- {column: [old, new]} for UPDATE; full row for INSERT/DELETE
);
create index if not exists audit_log_table_at_idx on public.audit_log (table_name, at desc);

alter table public.audit_log enable row level security;
do $do$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'audit_log' loop
    execute format('drop policy %I on public.audit_log', p.policyname);
  end loop;
end;
$do$;
create policy audit_log_admin_read on public.audit_log for select to authenticated using (public.is_admin());
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create or replace function public.pr_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_changed jsonb := '{}'::jsonb;
  k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if k not in ('updated_at') and (v_new -> k) is distinct from (v_old -> k) then
        v_changed := v_changed || jsonb_build_object(k, jsonb_build_array(v_old -> k, v_new -> k));
      end if;
    end loop;
    if v_changed = '{}'::jsonb then
      return new;                       -- nothing that matters changed
    end if;
  else
    v_changed := coalesce(v_new, v_old);
  end if;

  insert into public.audit_log (table_name, row_id, action, actor, actor_role, changed)
  values (tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key'),
          tg_op, auth.uid(), coalesce(auth.role(), current_user), v_changed);
  return case when tg_op = 'DELETE' then old else new end;
end;
$fn$;

revoke execute on function public.pr_audit() from public, anon, authenticated;

do $do$
declare t text;
begin
  foreach t in array array['products', 'orders', 'coupons', 'site_settings', 'product_costs',
                           'admin_users', 'quotations', 'proforma_invoices'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.pr_audit()', t || '_audit', t);
  end loop;
end;
$do$;
