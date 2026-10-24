-- Rollback for sql/44_agent_reports.sql: stops saving reports, restores the dashboard
-- stats from 37. The agent_reports table is kept; drop it by hand if really wanted.
drop function if exists public.agent_save_report(text, date, text, text, text);

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
    'approvals_pending', (select count(*) from approvals where status = 'pending' and expires_at > now())
  );
end;
$fn$;
