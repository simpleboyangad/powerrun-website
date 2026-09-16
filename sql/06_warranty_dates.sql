-- ============================================================================
-- PowerRun Industries - migration 06 / warranty dates
--
-- The existing warranties table has warranty_start_date and warranty_end_date
-- as NOT NULL with no default. Migration 01 only relaxed the order/customer
-- foreign keys, so a standalone public registration still failed with:
--   null value in column "warranty_start_date" violates not-null constraint
--
-- Rather than dropping the NOT NULL (the dates are genuinely useful), the
-- registration function now fills them in:
--   start = purchase date if supplied, otherwise today
--   end   = start + the warranty period written on the product
--           ("5 Years Warranty" -> 60 months, "18 Months Warranty" -> 18),
--           defaulting to 12 months when nothing can be determined.
-- ============================================================================

create or replace function public.pr_warranty_months(p_text text)
returns integer
language sql
immutable
as $fn$
  select coalesce(
    (nullif(substring(p_text from '(\d+)\s*[Yy]ear'), '')::int) * 12,
    (nullif(substring(p_text from '(\d+)\s*[Mm]onth'), '')::int),
    12
  );
$fn$;

create or replace function public.submit_warranty_registration(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id         uuid;
  v_number     text;
  v_mobile     text := nullif(trim(p_data->>'mobile'), '');
  v_name       text := nullif(trim(p_data->>'name'), '');
  v_serial     text := nullif(trim(p_data->>'serial_number'), '');
  v_product_id uuid := nullif(p_data->>'product_id', '')::uuid;
  v_purchase   date := nullif(p_data->>'purchase_date', '')::date;
  v_start      date;
  v_months     integer;
begin
  if v_name is null then raise exception 'Name is required' using errcode = 'P0001'; end if;
  if v_mobile is null or not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;
  if v_serial is null then raise exception 'Product serial number is required' using errcode = 'P0001'; end if;
  if v_purchase is not null and v_purchase > current_date then
    raise exception 'The purchase date cannot be in the future' using errcode = 'P0001';
  end if;

  v_start := coalesce(v_purchase, current_date);

  select public.pr_warranty_months(p.warranty) into v_months
  from products p where p.id = v_product_id;
  v_months := coalesce(v_months, 12);

  v_number := public.pr_next_number('public.pr_warranty_number_seq', 'PRW');

  insert into warranties (
    warranty_number, name, mobile, email, product_id, product_name,
    serial_number, purchase_date, invoice_number, dealer_name,
    address, city, state, pincode, status,
    warranty_start_date, warranty_end_date
  ) values (
    v_number, v_name, v_mobile, nullif(trim(p_data->>'email'), ''),
    v_product_id, nullif(trim(p_data->>'product_name'), ''),
    v_serial, v_purchase,
    nullif(trim(p_data->>'invoice_number'), ''),
    nullif(trim(p_data->>'dealer_name'), ''),
    nullif(trim(p_data->>'address'), ''),
    nullif(trim(p_data->>'city'), ''),
    nullif(trim(p_data->>'state'), ''),
    nullif(trim(p_data->>'pincode'), ''),
    'pending',
    v_start,
    v_start + (v_months || ' months')::interval
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'warranty_number', v_number, 'valid_until', v_start + (v_months || ' months')::interval);
end;
$fn$;

revoke execute on function public.submit_warranty_registration(jsonb) from public;
grant execute on function public.submit_warranty_registration(jsonb) to anon, authenticated;
