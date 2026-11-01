-- =============================================================================
-- PowerRun Industries - migration 47: 2-step login (MFA) for the admin panel
-- (owner request 2026-11-01)
--
-- The login page now asks for a 6-digit authenticator code after the password
-- (Supabase TOTP; a session that passed it carries aal = 'aal2' in its JWT).
-- This makes the DATABASE enforce the same rule, so a stolen password alone
-- opens no admin data even if someone bypasses the page:
--   * pr_mfa_ok(): true when this session passed the code step, OR the account
--     has no verified authenticator yet (so nobody is locked out before setup;
--     the login page makes setup compulsory for admins anyway).
--   * is_admin(), is_owner() and pr_my_role() (human roles) now also require it.
--   * is_agent() is unchanged: the AI agent logins (scripts/agent_client.py)
--     have no authenticator and keep working as before.
--
-- Lost phone: Supabase dashboard -> Authentication -> Users -> the user ->
-- delete the MFA factor; the next login shows the setup QR again.
-- Rollback: sql/47_admin_mfa_rollback.sql
-- =============================================================================

create or replace function public.pr_mfa_ok()
returns boolean language sql stable security definer set search_path = public, auth as $fn$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f
                      where f.user_id = auth.uid() and f.status = 'verified')
$fn$;

create or replace function public.pr_my_role()
returns text language sql stable security definer set search_path = public as $fn$
  select role from public.admin_users
   where user_id = auth.uid() and coalesce(is_active, true)
     and (role like 'agent\_%' or public.pr_mfa_ok())
   limit 1
$fn$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.admin_users
                 where user_id = auth.uid() and coalesce(is_active, true) = true
                   and coalesce(role, 'admin') not like 'agent\_%')
     and public.pr_mfa_ok()
$fn$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.admin_users
                 where user_id = auth.uid() and coalesce(is_active, true) and role = 'owner')
     and public.pr_mfa_ok()
$fn$;

revoke execute on function public.pr_mfa_ok() from public, anon;
grant execute on function public.pr_mfa_ok() to authenticated;
