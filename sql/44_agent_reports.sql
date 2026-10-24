-- =============================================================================
-- PowerRun Industries - migration 44: agent reports in the admin panel
--
-- The AI agents (scheduled tasks on the owner's PC) used to write their reports only
-- to files on the PC. Now they also save them here, so the owner reads them on the
-- phone in Admin -> Agent Report.
--   agent_reports: one row per day and kind (a re-run the same day replaces it)
--   agent_save_report(kind, date, title, summary, body_md): agents and admins
--   Only human admins can read the reports (they hold customer names and numbers,
--   and the monthly report holds margins); agents write through the function only.
--   admin_dashboard_stats() gains agent_reports_today (sidebar badge).
-- Rollback: sql/44_agent_reports_rollback.sql
-- =============================================================================

create table if not exists public.agent_reports (
  id           uuid primary key default gen_random_uuid(),
  report_date  date not null,
  kind         text not null check (kind in ('sales_support', 'seo', 'instagram', 'monthly', 'other')),
  title        text not null,
  summary      text,
  body_md      text not null check (length(body_md) <= 300000),
  agent_role   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (report_date, kind)
);
create index if not exists agent_reports_date_idx on public.agent_reports (report_date desc);

alter table public.agent_reports enable row level security;
do $do$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'agent_reports' loop
    execute format('drop policy %I on public.agent_reports', p.policyname);
  end loop; end; $do$;
create policy agent_reports_admin_read on public.agent_reports for select to authenticated using (public.is_admin());
revoke all on public.agent_reports from anon, authenticated;
grant select on public.agent_reports to authenticated;

create or replace function public.agent_save_report(p_kind text, p_date date, p_title text, p_summary text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if not (public.is_agent() or public.is_admin()) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'The report is empty' using errcode = 'P0001';
  end if;
  insert into agent_reports (report_date, kind, title, summary, body_md, agent_role)
  values (coalesce(p_date, (now() at time zone 'Asia/Kolkata')::date), p_kind, left(coalesce(nullif(trim(p_title), ''), p_kind), 200),
          left(p_summary, 1000), p_body, public.pr_my_role())
  on conflict (report_date, kind) do update
     set title = excluded.title, summary = excluded.summary, body_md = excluded.body_md,
         agent_role = excluded.agent_role, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$fn$;
revoke execute on function public.agent_save_report(text, date, text, text, text) from public, anon;
grant execute on function public.agent_save_report(text, date, text, text, text) to authenticated;

create or replace function public.admin_dashboard_stats()
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'total_products',    (select count(*) from products),
    'active_products',   (select count(*) from products where is_active),
    'total_orders',      (select count(*) from orders),
    'pending_orders',    (select count(*) from orders where order_status = 'pending'),
    'processing_orders', (select count(*) from orders where order_status = 'processing'),
    'confirmed_orders',  (select count(*) from orders where order_status = 'confirmed'),
    'shipped_orders',    (select count(*) from orders where order_status = 'shipped'),
    'completed_orders',  (select count(*) from orders where order_status = 'delivered'),
    'cancelled_orders',  (select count(*) from orders where order_status = 'cancelled'),
    'total_customers',   (select count(*) from customers),
    'warranty_requests', (select count(*) from warranties),
    'warranty_pending',  (select count(*) from warranties where status = 'pending'),
    'service_requests',  (select count(*) from service_tickets),
    'service_open',      (select count(*) from service_tickets where status = 'open'),
    'dealer_enquiries',  (select count(*) from dealer_enquiries),
    'dealer_new',        (select count(*) from dealer_enquiries where status = 'new'),
    'leads',             (select count(*) from leads),
    'revenue_paid',      (select coalesce(sum(total_amount), 0) from orders where payment_status = 'paid'),
    'revenue_total',     (select coalesce(sum(total_amount), 0) from orders where order_status <> 'cancelled'),
    'low_stock',         (select count(*) from products where is_active and coalesce(stock, 0) <= 5),
    'reviews_pending',   (select count(*) from product_reviews where status = 'pending'),
    'followups_today',   (select count(*) from follow_ups where status = 'pending' and due_at::date = current_date),
    'followups_overdue', (select count(*) from follow_ups where status = 'pending' and due_at < now()),
    'new_leads',         (select count(*) from leads where status = 'new'),
    'quotations_pending', (select count(*) from quotations where status = 'sent'),
    'approvals_pending', (select count(*) from approvals where status = 'pending' and expires_at > now()),
    'agent_reports_today', (select count(*) from agent_reports where report_date = (now() at time zone 'Asia/Kolkata')::date)
  );
end;
$fn$;
