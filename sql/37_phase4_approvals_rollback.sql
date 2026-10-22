-- Rollback for sql/37_phase4_approvals.sql
-- Agents lose all access, is_admin() again means any active admin_users row,
-- the discount checks go. The approvals table is kept (history); drop it by hand
-- only if really wanted:  drop table public.approvals; drop sequence public.pr_approval_number_seq;
drop trigger if exists proforma_invoices_discount_check on public.proforma_invoices;
drop trigger if exists quotations_discount_check on public.quotations;
drop function if exists public.pr_check_pi_discount();
drop function if exists public.pr_check_quote_discount();
drop function if exists public.pr_has_discount_approval(uuid, numeric);
drop function if exists public.pr_pi_discount_pct(jsonb, numeric);
drop function if exists public.decide_approval(uuid, boolean, text, text);
drop function if exists public.cancel_my_approval(uuid);
drop function if exists public.request_approval(text, text, uuid, jsonb, numeric, text);
drop function if exists public.pr_execute_approval(public.approvals);
drop function if exists public.agent_add_followup(uuid, uuid, text, text, timestamptz);
drop function if exists public.agent_update_lead(uuid, text, text);
drop policy if exists proforma_invoices_agent_insert on public.proforma_invoices;
drop policy if exists proforma_invoices_agent_update on public.proforma_invoices;
drop policy if exists approvals_requester_read on public.approvals;
revoke all on public.approvals from authenticated;
do $do$
declare t text;
begin
  foreach t in array array['orders', 'order_items', 'customers', 'customer_addresses', 'leads', 'follow_ups',
                           'quotations', 'quotation_items', 'quotation_audit_log', 'proforma_invoices',
                           'service_tickets', 'warranties', 'dealer_enquiries', 'product_reviews',
                           'stock_ledger', 'payment_events', 'coupons'] loop
    execute format('drop policy if exists %I on public.%I', t || '_agent_read', t);
  end loop;
end;
$do$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
      and coalesce(is_active, true) = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.admin_next_pi_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := now() at time zone 'Asia/Kolkata';
  v_fy  text;
  v_num integer;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  v_fy := case when extract(month from v_now) >= 4
    then to_char(v_now, 'YYYY') || '-' || to_char(v_now + interval '1 year', 'YY')
    else to_char(v_now - interval '1 year', 'YYYY') || '-' || to_char(v_now, 'YY')
  end;

  insert into public.pr_pi_number_counters (fy, last_number) values (v_fy, 1)
    on conflict (fy) do update set last_number = pr_pi_number_counters.last_number + 1
    returning last_number into v_num;

  return 'PRI/PI/' || v_fy || '/' || lpad(v_num::text, 4, '0');
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'quotations_pending', (select count(*) from quotations where status = 'sent')
  );
end;
$function$;

drop function if exists public.is_agent();
drop function if exists public.pr_my_role();
-- is_owner() stays only if approvals_owner_read still uses is_admin(); safe to drop
drop function if exists public.is_owner();
drop function if exists public.pr_discount_limit();
drop function if exists public.pr_payload_hash(jsonb);
