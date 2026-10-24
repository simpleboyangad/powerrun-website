-- =============================================================================
-- PowerRun Industries - migration 39 / Phase 6a: GST credit notes
--
-- A credit note reduces a tax invoice that was already issued: order cancelled
-- after invoicing, goods returned, or a price reduction / compensation
-- (CGST Act s.34, CGST Rules r.53).
--
--  * credit_notes: one row per note, own gapless series per financial year
--    PR/CN/26-27/0001 (16 characters, the GST maximum), linked to the original
--    invoice (an order or a manual PI), with a snapshot of the buyer and the
--    credited lines (taxable value, CGST/SGST or IGST per line).
--  * Issued notes can never be changed or deleted (trigger).
--  * admin_issue_credit_note(): human admins only. The browser computes the
--    lines with the same renderer that prints the invoice (assets/js/invoice-doc.js);
--    the database checks every line (GST rate, tax = taxable x rate, CGST/SGST vs
--    IGST from the place of supply), the quantity credited per line, and that all
--    notes together never exceed the invoice total. Optional restock for goods
--    that came back (stock ledger reason "credit note PR/CN/...").
--  * Agents can read credit notes; nobody writes the table directly.
--
-- Rollback: sql/39_credit_notes_rollback.sql
-- =============================================================================

create table if not exists public.credit_note_counters (
  financial_year text primary key,
  last_number    integer not null default 0
);
alter table public.credit_note_counters enable row level security;
revoke all on public.credit_note_counters from anon, authenticated;

create table if not exists public.credit_notes (
  id               uuid primary key default gen_random_uuid(),
  cn_number        text not null unique,
  cn_date          date not null,
  financial_year   text not null,
  source_type      text not null check (source_type in ('order', 'pi')),
  order_id         uuid references public.orders(id) on delete restrict,
  pi_id            uuid references public.proforma_invoices(id) on delete restrict,
  invoice_number   text not null,
  invoice_date     date,
  reason           text not null check (reason in ('order_cancelled', 'goods_returned', 'price_reduction',
                                                   'deficiency', 'other')),
  note             text,
  customer_name    text,
  business_name    text,
  gstin            text,
  mobile           text,
  address          text,
  city             text,
  state            text,
  pincode          text,
  place_of_supply  text,
  intra_state      boolean not null,
  lines            jsonb not null,
  taxable_amount   numeric(12,2) not null,
  cgst_amount      numeric(12,2) not null default 0,
  sgst_amount      numeric(12,2) not null default 0,
  igst_amount      numeric(12,2) not null default 0,
  round_off        numeric(12,2) not null default 0,
  total_amount     numeric(12,2) not null check (total_amount > 0),
  restocked        boolean not null default false,
  created_by       uuid,
  created_by_name  text,
  created_at       timestamptz not null default now(),
  check ((source_type = 'order') = (order_id is not null) and (source_type = 'pi') = (pi_id is not null))
);
create index if not exists credit_notes_date_idx on public.credit_notes (cn_date desc);
create index if not exists credit_notes_invoice_idx on public.credit_notes (invoice_number);

alter table public.credit_notes enable row level security;
do $do$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'credit_notes' loop
    execute format('drop policy %I on public.credit_notes', p.policyname);
  end loop; end; $do$;
create policy credit_notes_admin_read on public.credit_notes for select to authenticated using (public.is_admin());
create policy credit_notes_agent_read on public.credit_notes for select to authenticated using (public.is_agent());
revoke all on public.credit_notes from anon, authenticated;
grant select on public.credit_notes to authenticated;

create or replace function public.pr_freeze_credit_note()
returns trigger language plpgsql as $fn$
begin
  raise exception 'Credit note % is issued and cannot be changed or deleted', old.cn_number using errcode = 'P0001';
end;
$fn$;
drop trigger if exists credit_notes_freeze on public.credit_notes;
create trigger credit_notes_freeze before update or delete on public.credit_notes
  for each row execute function public.pr_freeze_credit_note();
drop trigger if exists credit_notes_audit on public.credit_notes;
create trigger credit_notes_audit after insert on public.credit_notes
  for each row execute function public.pr_audit();

-- p_lines: [{ key, name, hsn, qty, rate, taxable, cgst, sgst, igst, total, product_id }]
--   key = 'item:<order_items.id>' (order), 'line:<n>' (PI item n, 0-based) or 'freight'
create or replace function public.admin_issue_credit_note(p_source_type text, p_source_id uuid, p_reason text,
                                                          p_note text, p_lines jsonb, p_round_off numeric,
                                                          p_restock boolean)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_order   orders%rowtype;
  v_pi      proforma_invoices%rowtype;
  v_company jsonb := (select value from site_settings where key = 'company');
  v_today   date := (now() at time zone 'Asia/Kolkata')::date;
  v_fy      text := public.pr_current_fy_short();
  v_inv_no  text; v_inv_date date; v_grand numeric; v_pos text; v_intra boolean;
  v_name text; v_biz text; v_gstin text; v_mobile text; v_addr text; v_city text; v_state text; v_pin text;
  v_taxable numeric := 0; v_cgst numeric := 0; v_sgst numeric := 0; v_igst numeric := 0; v_total numeric;
  v_credited numeric; v_orig_qty numeric; v_prev_qty numeric;
  v_next integer; v_number text; v_id uuid; v_admin text;
  l jsonb; v_tax numeric; v_rate numeric;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can issue a credit note' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Choose at least one line to credit' using errcode = 'P0001';
  end if;
  if abs(coalesce(p_round_off, 0)) > 1 then
    raise exception 'Round off can be at most 1 rupee' using errcode = 'P0001';
  end if;

  if p_source_type = 'order' then
    select * into v_order from orders where id = p_source_id for update;
    if not found or v_order.invoice_number is null then
      raise exception 'Order has no tax invoice - nothing to credit' using errcode = 'P0001';
    end if;
    v_inv_no := v_order.invoice_number; v_inv_date := v_order.invoice_date; v_grand := v_order.total_amount;
    v_pos := coalesce(nullif(v_order.place_of_supply, ''), nullif(v_order.shipping_state, ''), v_order.state);
    v_name := v_order.customer_name; v_biz := v_order.customer_business_name; v_gstin := v_order.customer_gstin;
    v_mobile := v_order.customer_mobile; v_addr := v_order.address; v_city := v_order.city;
    v_state := v_order.state; v_pin := v_order.pincode;
  elsif p_source_type = 'pi' then
    select * into v_pi from proforma_invoices where id = p_source_id for update;
    if not found or v_pi.invoice_number is null then
      raise exception 'This PI has no tax invoice - nothing to credit' using errcode = 'P0001';
    end if;
    v_inv_no := v_pi.invoice_number; v_inv_date := v_pi.invoice_date; v_grand := v_pi.total_amount;
    v_pos := case when coalesce(trim(v_pi.gstin), '') <> '' then coalesce(nullif(v_pi.state, ''), v_pi.shipping_state)
                  when v_pi.ship_same then v_pi.state else coalesce(nullif(v_pi.shipping_state, ''), v_pi.state) end;
    v_name := v_pi.customer_name; v_biz := v_pi.business_name; v_gstin := upper(trim(v_pi.gstin));
    v_mobile := v_pi.mobile; v_addr := v_pi.address; v_city := v_pi.city; v_state := v_pi.state; v_pin := v_pi.pincode;
  else
    raise exception 'Unknown source %', p_source_type using errcode = 'P0001';
  end if;

  v_intra := coalesce(v_company ->> 'state', '') = '' or coalesce(v_pos, '') = ''
             or lower(trim(v_company ->> 'state')) = lower(trim(v_pos));

  for l in select * from jsonb_array_elements(p_lines) loop
    v_rate := (l ->> 'rate')::numeric;
    v_tax := coalesce((l ->> 'cgst')::numeric, 0) + coalesce((l ->> 'sgst')::numeric, 0) + coalesce((l ->> 'igst')::numeric, 0);
    if v_rate not in (0, 0.25, 3, 5, 12, 18, 28) then
      raise exception 'GST rate % is not valid', v_rate using errcode = 'P0001';
    end if;
    if (l ->> 'taxable')::numeric < 0 or v_tax < 0 or (l ->> 'qty')::numeric < 0 then
      raise exception 'Negative values are not allowed' using errcode = 'P0001';
    end if;
    if abs(v_tax - (l ->> 'taxable')::numeric * v_rate / 100) > 1 then
      raise exception 'Tax on "%" does not match % %% of its taxable value', l ->> 'name', v_rate using errcode = 'P0001';
    end if;
    if abs((l ->> 'total')::numeric - (l ->> 'taxable')::numeric - v_tax) > 0.02 then
      raise exception 'Line total of "%" is wrong', l ->> 'name' using errcode = 'P0001';
    end if;
    if v_intra and (coalesce((l ->> 'igst')::numeric, 0) <> 0
                    or abs(coalesce((l ->> 'cgst')::numeric, 0) - coalesce((l ->> 'sgst')::numeric, 0)) > 0.011) then
      raise exception 'Same-state invoice: use CGST + SGST' using errcode = 'P0001';
    end if;
    if not v_intra and (coalesce((l ->> 'cgst')::numeric, 0) <> 0 or coalesce((l ->> 'sgst')::numeric, 0) <> 0) then
      raise exception 'Other-state invoice: use IGST' using errcode = 'P0001';
    end if;

    -- quantity credited per original line, across all notes for this invoice
    if (l ->> 'qty')::numeric > 0 and l ->> 'key' <> 'freight' then
      if p_source_type = 'order' then
        select quantity into v_orig_qty from order_items
         where order_id = p_source_id and 'item:' || id::text = l ->> 'key';
      else
        select (v_pi.items -> (substring(l ->> 'key' from '^line:(\d+)$')::int) ->> 'quantity')::numeric into v_orig_qty;
      end if;
      if v_orig_qty is null then
        raise exception 'Line "%" is not on invoice %', l ->> 'name', v_inv_no using errcode = 'P0001';
      end if;
      select coalesce(sum((x ->> 'qty')::numeric), 0) into v_prev_qty
        from credit_notes c, jsonb_array_elements(c.lines) x
       where c.invoice_number = v_inv_no and x ->> 'key' = l ->> 'key';
      if v_prev_qty + (l ->> 'qty')::numeric > v_orig_qty then
        raise exception '"%": % already credited, only % were invoiced', l ->> 'name', v_prev_qty, v_orig_qty
          using errcode = 'P0001';
      end if;
    end if;

    v_taxable := v_taxable + (l ->> 'taxable')::numeric;
    v_cgst := v_cgst + coalesce((l ->> 'cgst')::numeric, 0);
    v_sgst := v_sgst + coalesce((l ->> 'sgst')::numeric, 0);
    v_igst := v_igst + coalesce((l ->> 'igst')::numeric, 0);
  end loop;

  v_total := round(v_taxable + v_cgst + v_sgst + v_igst + coalesce(p_round_off, 0), 2);
  if v_total <= 0 then raise exception 'The credit note has no amount' using errcode = 'P0001'; end if;
  select coalesce(sum(total_amount), 0) into v_credited from credit_notes where invoice_number = v_inv_no;
  if v_credited + v_total > v_grand + 0.01 then
    raise exception 'Invoice % is % - % is already credited, at most % can be credited now',
      v_inv_no, v_grand, v_credited, v_grand - v_credited using errcode = 'P0001';
  end if;

  insert into credit_note_counters (financial_year, last_number) values (v_fy, 1)
  on conflict (financial_year) do update set last_number = credit_note_counters.last_number + 1
  returning last_number into v_next;
  v_number := 'PR/CN/' || v_fy || '/' || lpad(v_next::text, 4, '0');
  select name into v_admin from admin_users where user_id = auth.uid();

  insert into credit_notes (cn_number, cn_date, financial_year, source_type, order_id, pi_id, invoice_number,
                            invoice_date, reason, note, customer_name, business_name, gstin, mobile, address, city,
                            state, pincode, place_of_supply, intra_state, lines, taxable_amount, cgst_amount,
                            sgst_amount, igst_amount, round_off, total_amount, restocked, created_by, created_by_name)
  values (v_number, v_today, v_fy, p_source_type, case when p_source_type = 'order' then p_source_id end,
          case when p_source_type = 'pi' then p_source_id end, v_inv_no, v_inv_date, p_reason, left(p_note, 1000),
          v_name, nullif(v_biz, ''), nullif(v_gstin, ''), v_mobile, v_addr, v_city, v_state, v_pin, v_pos, v_intra,
          p_lines, round(v_taxable, 2), round(v_cgst, 2), round(v_sgst, 2), round(v_igst, 2),
          coalesce(p_round_off, 0), v_total, coalesce(p_restock, false), auth.uid(), v_admin)
  returning id into v_id;

  if coalesce(p_restock, false) then
    if p_source_type = 'order' and v_order.order_status = 'cancelled' then
      raise exception 'This order is cancelled - its stock was already returned' using errcode = 'P0001';
    end if;
    perform set_config('powerrun.stock_reason', 'credit note ' || v_number, true);
    update products p set stock = coalesce(p.stock, 0) + q.qty,
           availability = case when p.availability = 'out_of_stock' then 'in_stock' else p.availability end
      from (select (x ->> 'product_id')::uuid pid, sum((x ->> 'qty')::numeric)::int qty
              from jsonb_array_elements(p_lines) x
             where nullif(x ->> 'product_id', '') is not null and (x ->> 'qty')::numeric > 0 group by 1) q
     where p.id = q.pid;
  end if;

  return jsonb_build_object('id', v_id, 'cn_number', v_number, 'cn_date', v_today, 'total_amount', v_total);
end;
$fn$;
revoke execute on function public.admin_issue_credit_note(text, uuid, text, text, jsonb, numeric, boolean) from public, anon;
grant execute on function public.admin_issue_credit_note(text, uuid, text, text, jsonb, numeric, boolean) to authenticated;
revoke execute on function public.pr_freeze_credit_note() from public, anon, authenticated;
