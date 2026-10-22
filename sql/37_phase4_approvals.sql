-- =============================================================================
-- PowerRun Industries - migration 37 / Phase 4: roles and the Approval Center
--
-- 1. Roles. admin_users.role: 'owner' (and any other human role: admin, staff) = full admin;
--    'agent_sales' / 'agent_support' / 'agent_ops' = AI agents.
--    is_admin() now means a human admin only, so an agent login never inherits the
--    69 admin policies. is_owner(), is_agent() and pr_my_role() are new.
-- 2. Agents can READ the business tables they work with (orders, customers, leads,
--    quotations, PIs, tickets, warranties, stock ledger, payment events ...) but not
--    costs, settings, audit log or other admins. They WRITE only through RPCs:
--    agent_add_followup(), agent_update_lead(), request_approval().
-- 3. approvals: every risky action is a request with its exact payload, a SHA-256
--    hash of that payload, an amount, a reason and a 48-hour expiry. Only the owner
--    can approve or reject; approving checks the hash the owner was shown, then
--    runs the action ONCE through a fixed function and stores the result or error.
--    Actions: stock_adjust, order_cancel, tax_invoice_cancel, discount_override,
--    refund_record, warranty_exception, data_export.
-- 4. Discount rule: anyone but the owner can draft any price, but cannot mark a PI
--    sent/paid or a quotation sent/accepted more than pr_discount_limit() % (4 %)
--    below the website price unless the owner approved a discount_override for that
--    record (target_id = the PI / quotation id). The owner is never blocked.
-- 5. admin_dashboard_stats() gains approvals_pending (sidebar badge).
--
-- Rollback: sql/37_phase4_approvals_rollback.sql
-- =============================================================================

-- 1 ---------------------------------------------------------------------------
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

create or replace function public.is_agent()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.admin_users
                 where user_id = auth.uid() and coalesce(is_active, true) and role like 'agent\_%')
$fn$;

create or replace function public.pr_discount_limit()
returns numeric language sql immutable as $fn$ select 4::numeric $fn$;   -- owner decision 2026-10-22

-- the single human admin becomes the owner (only when there is exactly one and no owner yet)
update public.admin_users set role = 'owner'
 where coalesce(is_active, true) and coalesce(role, 'admin') in ('admin', 'staff')
   and not exists (select 1 from public.admin_users where role = 'owner')
   and (select count(*) from public.admin_users where coalesce(is_active, true)) = 1;

revoke execute on function public.pr_my_role(), public.is_owner(), public.is_agent() from public, anon;
grant execute on function public.pr_my_role(), public.is_owner(), public.is_agent() to authenticated;

-- 2 ---------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array['orders', 'order_items', 'customers', 'customer_addresses', 'leads', 'follow_ups',
                           'quotations', 'quotation_items', 'quotation_audit_log', 'proforma_invoices',
                           'service_tickets', 'warranties', 'dealer_enquiries', 'product_reviews',
                           'stock_ledger', 'payment_events', 'coupons'] loop
    execute format('drop policy if exists %I on public.%I', t || '_agent_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_agent())',
                   t || '_agent_read', t);
  end loop;
end;
$do$;
drop policy if exists admin_users_self_read on public.admin_users;
create policy admin_users_self_read on public.admin_users for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- the sales agent may draft PIs (never issue a tax invoice, never delete, never touch an issued one)
drop policy if exists proforma_invoices_agent_insert on public.proforma_invoices;
drop policy if exists proforma_invoices_agent_update on public.proforma_invoices;
create policy proforma_invoices_agent_insert on public.proforma_invoices for insert to authenticated
  with check (public.pr_my_role() = 'agent_sales' and invoice_number is null and status in ('draft', 'sent'));
create policy proforma_invoices_agent_update on public.proforma_invoices for update to authenticated
  using (public.pr_my_role() = 'agent_sales' and invoice_number is null and status in ('draft', 'sent'))
  with check (public.pr_my_role() = 'agent_sales' and invoice_number is null and status in ('draft', 'sent'));

create or replace function public.admin_next_pi_number()
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v_now timestamptz := now() at time zone 'Asia/Kolkata';
  v_fy  text;
  v_num integer;
begin
  if not (public.is_admin() or public.pr_my_role() = 'agent_sales') then
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
$fn$;

create or replace function public.agent_add_followup(p_lead_id uuid, p_customer_id uuid, p_title text,
                                                     p_notes text, p_due_at timestamptz)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_admin uuid;
begin
  if not (public.is_agent() or public.is_admin()) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if num_nonnulls(p_lead_id, p_customer_id) <> 1 then
    raise exception 'Give exactly one of lead or customer' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_title), '') = '' or p_due_at is null then
    raise exception 'Title and due time are required' using errcode = 'P0001';
  end if;
  select id into v_admin from admin_users where user_id = auth.uid();
  insert into follow_ups (lead_id, customer_id, title, notes, due_at, status, created_by)
  values (p_lead_id, p_customer_id, left(trim(p_title), 200), left(p_notes, 2000), p_due_at, 'pending', v_admin)
  returning id into v_id;
  return v_id;
end;
$fn$;

create or replace function public.agent_update_lead(p_lead_id uuid, p_status text, p_priority text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not (public.is_agent() or public.is_admin()) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if p_status = 'converted' then
    raise exception 'Converting a lead is done by the owner' using errcode = 'P0001';
  end if;
  update leads set status = coalesce(p_status, status), priority = coalesce(p_priority, priority), updated_at = now()
   where id = p_lead_id;
  if not found then raise exception 'Lead not found' using errcode = 'P0001'; end if;
end;
$fn$;
revoke execute on function public.agent_add_followup(uuid, uuid, text, text, timestamptz) from public, anon;
revoke execute on function public.agent_update_lead(uuid, text, text) from public, anon;
grant execute on function public.agent_add_followup(uuid, uuid, text, text, timestamptz) to authenticated;
grant execute on function public.agent_update_lead(uuid, text, text) to authenticated;

-- 3 ---------------------------------------------------------------------------
create sequence if not exists public.pr_approval_number_seq;

create table if not exists public.approvals (
  id               uuid primary key default gen_random_uuid(),
  request_no       text not null unique default ('APR-' || lpad(nextval('public.pr_approval_number_seq')::text, 5, '0')),
  action           text not null check (action in ('stock_adjust', 'order_cancel', 'tax_invoice_cancel', 'discount_override',
                                                   'refund_record', 'warranty_exception', 'data_export')),
  target_table     text,
  target_id        uuid,
  payload          jsonb not null default '{}'::jsonb,
  payload_hash     text not null,
  amount           numeric,
  reason           text not null,
  requested_by     uuid,
  requested_name   text,
  requested_role   text,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired',
                                                                     'cancelled', 'executed', 'failed')),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_note    text,
  expires_at       timestamptz not null default now() + interval '48 hours',
  executed_at      timestamptz,
  result           jsonb,
  error            text,
  created_at       timestamptz not null default now()
);
create index if not exists approvals_status_idx on public.approvals (status, created_at desc);
create index if not exists approvals_target_idx on public.approvals (target_id);

alter table public.approvals enable row level security;
do $do$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'approvals' loop
    execute format('drop policy %I on public.approvals', p.policyname);
  end loop; end; $do$;
create policy approvals_owner_read on public.approvals for select to authenticated using (public.is_admin());
create policy approvals_requester_read on public.approvals for select to authenticated using (requested_by = auth.uid());
revoke all on public.approvals from anon, authenticated;
grant select on public.approvals to authenticated;      -- writes only through the functions below
drop trigger if exists approvals_audit on public.approvals;
create trigger approvals_audit after insert or update or delete on public.approvals
  for each row execute function public.pr_audit();

create or replace function public.pr_payload_hash(p jsonb)
returns text language sql immutable as $fn$
  select encode(extensions.digest(convert_to(coalesce(p, '{}'::jsonb)::text, 'UTF8'), 'sha256'), 'hex')
$fn$;

create or replace function public.request_approval(p_action text, p_target_table text, p_target_id uuid,
                                                   p_payload jsonb, p_amount numeric, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v approvals%rowtype; v_name text; v_role text;
begin
  if not (public.is_agent() or public.is_admin()) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = 'P0001';
  end if;
  select name, role into v_name, v_role from admin_users where user_id = auth.uid();
  insert into approvals (action, target_table, target_id, payload, payload_hash, amount, reason,
                         requested_by, requested_name, requested_role)
  values (p_action, p_target_table, p_target_id, coalesce(p_payload, '{}'::jsonb),
          public.pr_payload_hash(p_payload), p_amount, left(trim(p_reason), 1000),
          auth.uid(), v_name, v_role)
  returning * into v;
  return jsonb_build_object('id', v.id, 'request_no', v.request_no, 'expires_at', v.expires_at);
end;
$fn$;

create or replace function public.pr_execute_approval(v approvals)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  p jsonb := v.payload;
  v_n integer;
  v_order orders%rowtype;
begin
  case v.action
  when 'stock_adjust' then
    perform set_config('powerrun.stock_reason', 'approved ' || v.request_no || ': ' || left(v.reason, 120), true);
    update products set stock = greatest(coalesce(stock, 0) + (p ->> 'change')::integer, 0),
                        availability = case when coalesce(stock, 0) + (p ->> 'change')::integer > 0
                                             and availability = 'out_of_stock' then 'in_stock' else availability end
     where id = (p ->> 'product_id')::uuid;
    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'Product not found'; end if;
    return jsonb_build_object('stock', (select stock from products where id = (p ->> 'product_id')::uuid));

  when 'order_cancel' then
    select * into v_order from orders where id = (p ->> 'order_id')::uuid for update;
    if not found then raise exception 'Order not found'; end if;
    if v_order.order_status in ('shipped', 'delivered') then raise exception 'Order already %', v_order.order_status; end if;
    update orders set order_status = 'cancelled',
                      cancelled_reason = trim(coalesce(cancelled_reason, '') || ' ' || v.request_no || ': ' || left(v.reason, 200))
     where id = v_order.id;                     -- restock_on_cancel returns the stock
    return jsonb_build_object('order_number', v_order.order_number, 'order_status', 'cancelled');

  when 'tax_invoice_cancel' then
    update proforma_invoices set status = 'cancelled',
           notes = trim(coalesce(notes, '') || E'\n' || 'Cancelled ' || v.request_no || ': ' || left(v.reason, 200))
     where id = (p ->> 'pi_id')::uuid;
    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'PI / tax invoice not found'; end if;
    return jsonb_build_object('status', 'cancelled');

  when 'refund_record' then
    update orders set refund_amount = coalesce(refund_amount, 0) + (p ->> 'amount')::numeric,
           notes = trim(coalesce(notes, '') || ' [Refund ' || (p ->> 'amount') || ' approved ' || v.request_no || ']')
     where id = (p ->> 'order_id')::uuid;
    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'Order not found'; end if;
    return jsonb_build_object('note', 'Refund recorded; send the money from Razorpay / bank yourself');

  else   -- discount_override, warranty_exception, data_export: the approval itself is the permission
    return jsonb_build_object('note', 'Approved permission recorded');
  end case;
end;
$fn$;
revoke execute on function public.pr_execute_approval(approvals) from public, anon, authenticated;

create or replace function public.decide_approval(p_id uuid, p_approve boolean, p_hash text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v approvals%rowtype; v_res jsonb;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can decide approvals' using errcode = '42501';
  end if;
  select * into v from approvals where id = p_id for update;
  if not found then raise exception 'Request not found' using errcode = 'P0001'; end if;
  if v.status <> 'pending' then raise exception 'Request is already %', v.status using errcode = 'P0001'; end if;
  if v.expires_at < now() then
    update approvals set status = 'expired' where id = p_id;
    return jsonb_build_object('status', 'expired');
  end if;
  if not p_approve then
    update approvals set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 1000)
     where id = p_id;
    return jsonb_build_object('status', 'rejected');
  end if;
  if p_hash is distinct from v.payload_hash or public.pr_payload_hash(v.payload) <> v.payload_hash then
    raise exception 'The request changed after you opened it - reload and check again' using errcode = 'P0001';
  end if;

  update approvals set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 1000)
   where id = p_id;
  if v.action in ('discount_override', 'warranty_exception', 'data_export') then
    return jsonb_build_object('status', 'approved');     -- used later by the action it allows
  end if;
  begin
    v_res := public.pr_execute_approval(v);
    update approvals set status = 'executed', executed_at = now(), result = v_res where id = p_id;
    return jsonb_build_object('status', 'executed', 'result', v_res);
  exception when others then
    update approvals set status = 'failed', executed_at = now(), error = left(sqlerrm, 500) where id = p_id;
    return jsonb_build_object('status', 'failed', 'error', sqlerrm);
  end;
end;
$fn$;

create or replace function public.cancel_my_approval(p_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  update approvals set status = 'cancelled' where id = p_id and status = 'pending'
     and (requested_by = auth.uid() or public.is_owner());
  if not found then raise exception 'Nothing to cancel' using errcode = 'P0001'; end if;
end;
$fn$;

revoke execute on function public.request_approval(text, text, uuid, jsonb, numeric, text),
                       public.decide_approval(uuid, boolean, text, text),
                       public.cancel_my_approval(uuid) from public, anon;
grant execute on function public.request_approval(text, text, uuid, jsonb, numeric, text),
                      public.decide_approval(uuid, boolean, text, text),
                      public.cancel_my_approval(uuid) to authenticated;

-- 4 ---------------------------------------------------------------------------
-- % below the website price: (catalogue value - quoted value) / catalogue value,
-- over the lines that are linked to a catalogue product.
create or replace function public.pr_pi_discount_pct(p_items jsonb, p_discount numeric)
returns numeric language sql stable security definer set search_path = public as $fn$
  with l as (
    select (i ->> 'quantity')::numeric q, (i ->> 'unit_price')::numeric u,
           case when coalesce(p.price_includes_gst, true) then p.price
                else p.price * (1 + coalesce(p.gst_rate, 18) / 100) end cat      -- PI rates include GST
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
    join products p on p.id = nullif(i ->> 'product_id', '')::uuid
  )
  select case when coalesce(sum(q * cat), 0) <= 0 then 0
              else round(100 * (sum(q * cat) - (sum(q * u) - coalesce(p_discount, 0))) / sum(q * cat), 2) end
  from l
$fn$;

create or replace function public.pr_has_discount_approval(p_target uuid, p_pct numeric)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from approvals
                 where action = 'discount_override' and target_id = p_target and status = 'approved'
                   and expires_at > now() and (payload ->> 'discount_pct')::numeric >= p_pct)
$fn$;

create or replace function public.pr_check_pi_discount()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_pct numeric;
begin
  if public.is_owner() then return new; end if;               -- the owner is never blocked
  if new.status not in ('sent', 'paid') then return new; end if;  -- drafts may carry any price
  v_pct := public.pr_pi_discount_pct(new.items, new.discount_amount);
  if v_pct > public.pr_discount_limit() and not public.pr_has_discount_approval(new.id, v_pct) then
    raise exception 'Discount % %% is above % %% - request owner approval (discount_override) first',
      v_pct, public.pr_discount_limit() using errcode = 'P0001';
  end if;
  return new;
end;
$fn$;
drop trigger if exists proforma_invoices_discount_check on public.proforma_invoices;
create trigger proforma_invoices_discount_check before insert or update on public.proforma_invoices
  for each row execute function public.pr_check_pi_discount();

create or replace function public.pr_check_quote_discount()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_cat numeric; v_quoted numeric; v_pct numeric;
begin
  if public.is_owner() then return new; end if;
  if new.status not in ('sent', 'accepted') or new.status is not distinct from old.status then return new; end if;
  select sum(qi.quantity * case when coalesce(p.price_includes_gst, true) then p.price
                                else p.price * (1 + coalesce(p.gst_rate, 18) / 100) end),
         sum(qi.total_price) into v_cat, v_quoted
    from quotation_items qi join products p on p.id = qi.product_id where qi.quotation_id = new.id;
  v_pct := case when coalesce(v_cat, 0) <= 0 then 0
                else round(100 * (v_cat - (v_quoted - coalesce(new.discount_amount, 0))) / v_cat, 2) end;
  if v_pct > public.pr_discount_limit() and not public.pr_has_discount_approval(new.id, v_pct) then
    raise exception 'Discount % %% is above % %% - request owner approval (discount_override) first',
      v_pct, public.pr_discount_limit() using errcode = 'P0001';
  end if;
  return new;
end;
$fn$;
drop trigger if exists quotations_discount_check on public.quotations;
create trigger quotations_discount_check before update on public.quotations
  for each row execute function public.pr_check_quote_discount();

revoke execute on function public.pr_check_pi_discount(), public.pr_check_quote_discount(),
                          public.pr_has_discount_approval(uuid, numeric) from public, anon, authenticated;

-- 5 ---------------------------------------------------------------------------
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
