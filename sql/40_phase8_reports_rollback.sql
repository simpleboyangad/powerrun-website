-- Rollback for sql/40_phase8_reports.sql (orders.is_test is kept - it is data)
drop function if exists public.report_sales(date, date);
drop function if exists public.report_receivables();
drop function if exists public.report_dispatch();
drop function if exists public.report_leads(date, date);
drop function if exists public.report_stock(date, date);
drop function if exists public.report_margin(date, date);
drop function if exists public.report_health();
drop function if exists public.pr_can_report();
drop function if exists public.pr_ist_date(timestamptz);
