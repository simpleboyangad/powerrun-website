-- ============================================================================
-- PowerRun Industries - migration 07 / function hardening
--
-- Raised by Supabase's own Security Advisor after migrations 01-06.
-- Result there was 0 errors; these are the warnings actually worth acting on.
--
-- 1. search_path was not pinned on six functions. For a SECURITY DEFINER
--    function that is a real hijack risk: a caller who can create objects in a
--    schema earlier on the search path could shadow a table or function the
--    body references and have it run with the definer's privileges.
--
-- 2. Several internal helpers were executable by anon/authenticated because
--    Postgres grants EXECUTE to PUBLIC by default. They are only ever called
--    from inside other SECURITY DEFINER functions or from triggers, so nobody
--    on the outside needs to call them. pr_next_number in particular could be
--    called repeatedly by anyone to burn order-number sequence values.
--
-- get_order_details() is left in place but secured: it is a leftover from the
-- previous implementation and nothing in the current site calls it. It can be
-- dropped once you are sure nothing else depends on it:
--     drop function if exists public.get_order_details(uuid);
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Pin search_path on every function that was missing it
-- ---------------------------------------------------------------------------
alter function public.get_order_details(uuid)      set search_path = public;
alter function public.generate_ticket_number()     set search_path = public;
alter function public.set_ticket_number()          set search_path = public;
alter function public.set_updated_at()             set search_path = public;
alter function public.pr_valid_mobile(text)        set search_path = public;
alter function public.pr_warranty_months(text)     set search_path = public;

-- ---------------------------------------------------------------------------
-- 2. Internal helpers: not callable from the outside
--    (they still work perfectly inside triggers and SECURITY DEFINER bodies,
--     which run as the function owner rather than as the caller)
-- ---------------------------------------------------------------------------
revoke execute on function public.pr_next_number(text, text)   from public, anon, authenticated;
revoke execute on function public.restock_cancelled_order()    from public, anon, authenticated;
revoke execute on function public.set_updated_at()             from public, anon, authenticated;
revoke execute on function public.set_ticket_number()          from public, anon, authenticated;
revoke execute on function public.generate_ticket_number()     from public, anon, authenticated;
revoke execute on function public.pr_valid_mobile(text)        from public, anon, authenticated;
revoke execute on function public.pr_warranty_months(text)     from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The leftover order-details function: no public access
--    (the site uses get_order_public(order_number, mobile), which verifies the
--     mobile number before returning anything)
-- ---------------------------------------------------------------------------
revoke execute on function public.get_order_details(uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- 4. Re-assert exactly which functions the website may call.
--    Unchanged from migration 02 - repeated here so this file is a complete,
--    self-contained statement of the public API surface.
-- ---------------------------------------------------------------------------
grant execute on function public.is_admin()                                to anon, authenticated;
grant execute on function public.create_website_order(jsonb, jsonb, text)  to anon, authenticated;
grant execute on function public.get_order_public(text, text)              to anon, authenticated;
grant execute on function public.submit_warranty_registration(jsonb)       to anon, authenticated;
grant execute on function public.submit_service_request(jsonb)             to anon, authenticated;
grant execute on function public.submit_dealer_enquiry(jsonb)              to anon, authenticated;
grant execute on function public.submit_contact_lead(jsonb)                to anon, authenticated;
grant execute on function public.admin_dashboard_stats()                   to authenticated;
