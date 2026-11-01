-- Rollback for sql/47_admin_mfa.sql: role checks go back to the 37 versions
-- (password-only). Authenticators already set up stay linked; the login page
-- still asks for the code.
create or replace function public.pr_my_role()
returns text language sql stable security definer set search_path = public as $fn$
  select role from public.admin_users where user_id = auth.uid() and coalesce(is_active, true) limit 1
$fn$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.admin_users
                 where user_id = auth.uid() and coalesce(is_active, true) = true
                   and coalesce(role, 'admin') not like 'agent\_%')
$fn$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.admin_users
                 where user_id = auth.uid() and coalesce(is_active, true) and role = 'owner')
$fn$;

drop function if exists public.pr_mfa_ok();
