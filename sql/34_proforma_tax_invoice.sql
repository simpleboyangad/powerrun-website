-- =============================================================================
-- PowerRun Industries - tax invoices from manual proforma invoices
--
-- Admin → Proforma Invoice (PI) → "Tax Invoice": a preview of the tax
-- invoice with the number it will get, then "Confirm" issues it.
--
-- * Same gapless GST series as website orders (invoice_counters,
--   PR/<yy-yy>/0001 from migration 32), so orders and manual invoices share
--   one series and a number can never repeat.
-- * peek_next_tax_invoice_number() only reads the counter (for the preview).
-- * issue_pi_tax_invoice() is idempotent: a PI keeps its number once issued.
-- * Once issued, the invoice is frozen: party, items, amounts and dates can no
--   longer change and the row cannot be deleted (GST invoices must not be
--   altered or removed). Status (paid / cancelled), payment terms and notes
--   stay editable; a mistake is handled by marking it cancelled.
-- =============================================================================

alter table public.proforma_invoices add column if not exists invoice_number text;
alter table public.proforma_invoices add column if not exists invoice_date   date;
create unique index if not exists proforma_invoices_invoice_number_key
  on public.proforma_invoices (invoice_number) where invoice_number is not null;

-- ------------------------------------------------------------- next number
create or replace function public.pr_current_fy_short()
returns text
language sql
stable
as $fn$
  select case when extract(month from (now() at time zone 'Asia/Kolkata')) >= 4
              then to_char((now() at time zone 'Asia/Kolkata'), 'YY') || '-' ||
                   to_char((now() at time zone 'Asia/Kolkata') + interval '1 year', 'YY')
              else to_char((now() at time zone 'Asia/Kolkata') - interval '1 year', 'YY') || '-' ||
                   to_char((now() at time zone 'Asia/Kolkata'), 'YY') end
$fn$;

create or replace function public.peek_next_tax_invoice_number()
returns text
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_fy   text := public.pr_current_fy_short();
  v_last integer;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  select last_number into v_last from invoice_counters where financial_year = v_fy;
  return 'PR/' || v_fy || '/' || lpad((coalesce(v_last, 0) + 1)::text, 4, '0');
end;
$fn$;

revoke execute on function public.peek_next_tax_invoice_number() from public, anon;
grant execute on function public.peek_next_tax_invoice_number() to authenticated;

-- ------------------------------------------------------------------- issue
create or replace function public.issue_pi_tax_invoice(p_pi_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_pi     proforma_invoices%rowtype;
  v_today  date := (now() at time zone 'Asia/Kolkata')::date;
  v_fy     text := public.pr_current_fy_short();
  v_next   integer;
  v_number text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can issue a tax invoice' using errcode = '42501';
  end if;

  select * into v_pi from proforma_invoices where id = p_pi_id for update;
  if not found then
    raise exception 'Proforma invoice not found' using errcode = 'P0001';
  end if;
  if v_pi.invoice_number is not null then
    return jsonb_build_object('invoice_number', v_pi.invoice_number,
                              'invoice_date', v_pi.invoice_date, 'new', false);
  end if;
  if v_pi.status = 'cancelled' then
    raise exception 'A cancelled PI cannot get a tax invoice' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(v_pi.items, '[]'::jsonb)) = 0 or coalesce(v_pi.total_amount, 0) <= 0 then
    raise exception 'The PI has no items or no amount' using errcode = 'P0001';
  end if;

  insert into invoice_counters (financial_year, last_number) values (v_fy, 1)
  on conflict (financial_year) do update set last_number = invoice_counters.last_number + 1
  returning last_number into v_next;

  v_number := 'PR/' || v_fy || '/' || lpad(v_next::text, 4, '0');

  update proforma_invoices set invoice_number = v_number, invoice_date = v_today where id = p_pi_id;

  return jsonb_build_object('invoice_number', v_number, 'invoice_date', v_today, 'new', true);
end;
$fn$;

revoke execute on function public.issue_pi_tax_invoice(uuid) from public, anon;
grant execute on function public.issue_pi_tax_invoice(uuid) to authenticated;

-- ---------------------------------------------------- freeze issued invoices
create or replace function public.pr_freeze_issued_pi()
returns trigger
language plpgsql
as $fn$
begin
  if tg_op = 'DELETE' then
    if old.invoice_number is not null then
      raise exception 'Tax invoice % cannot be deleted - mark it cancelled instead', old.invoice_number
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if old.invoice_number is not null then
    if new.invoice_number is distinct from old.invoice_number
       or new.invoice_date is distinct from old.invoice_date
       or new.pi_number is distinct from old.pi_number
       or new.pi_date is distinct from old.pi_date
       or new.party_type is distinct from old.party_type
       or new.customer_name is distinct from old.customer_name
       or new.business_name is distinct from old.business_name
       or new.gstin is distinct from old.gstin
       or new.mobile is distinct from old.mobile
       or new.email is distinct from old.email
       or new.address is distinct from old.address
       or new.city is distinct from old.city
       or new.state is distinct from old.state
       or new.pincode is distinct from old.pincode
       or new.ship_same is distinct from old.ship_same
       or new.shipping_address is distinct from old.shipping_address
       or new.shipping_city is distinct from old.shipping_city
       or new.shipping_state is distinct from old.shipping_state
       or new.shipping_pincode is distinct from old.shipping_pincode
       or new.items is distinct from old.items
       or new.discount_amount is distinct from old.discount_amount
       or new.shipping_cost is distinct from old.shipping_cost
       or new.total_amount is distinct from old.total_amount then
      raise exception 'Tax invoice % is issued and cannot be changed - mark it cancelled and make a new one',
        old.invoice_number using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists proforma_invoices_freeze on public.proforma_invoices;
create trigger proforma_invoices_freeze before update or delete on public.proforma_invoices
  for each row execute function public.pr_freeze_issued_pi();
