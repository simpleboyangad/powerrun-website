-- ============================================================================
-- PowerRun Industries - migration 08 / customer accounts
--
-- Customers can now hold an account and see their own orders and invoices.
-- Most of what that needs already existed: orders.user_id, the
-- orders_owner_read / order_items_owner_read policies, and
-- create_website_order() stamping auth.uid() onto new orders.
--
-- This migration adds the two pieces that were missing:
--
--   claim_order()        attaches an order that was placed as a guest to the
--                        account of whoever is signed in. It deliberately
--                        requires BOTH the order number AND the mobile the
--                        order was placed with, so a customer cannot pull
--                        somebody else's order into their account by guessing
--                        a phone number.
--
--   upsert_my_customer() lets a signed-in customer maintain their own name,
--                        email, mobile and address without granting the
--                        customers table to them directly.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Saved delivery details on the customer record
-- ---------------------------------------------------------------------------
alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists city text;
alter table public.customers add column if not exists state text;
alter table public.customers add column if not exists pincode text;

-- ---------------------------------------------------------------------------
-- Claim a guest order into the signed-in account
-- ---------------------------------------------------------------------------
create or replace function public.claim_order(p_order_number text, p_mobile text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user_id     uuid := auth.uid();
  v_order       orders%rowtype;
  v_customer_id uuid;
begin
  if v_user_id is null then
    raise exception 'Please sign in first' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_order_number), '') = '' or coalesce(trim(p_mobile), '') = '' then
    raise exception 'Order ID and mobile number are both required' using errcode = 'P0001';
  end if;

  select * into v_order from orders
  where upper(order_number) = upper(trim(p_order_number))
    and customer_mobile = trim(p_mobile);

  if not found then
    raise exception 'No order found for that order ID and mobile number' using errcode = 'P0001';
  end if;

  if v_order.user_id is not null and v_order.user_id <> v_user_id then
    raise exception 'That order already belongs to another account' using errcode = 'P0001';
  end if;

  -- Reuse this account's customer record, or adopt the order's existing one.
  select id into v_customer_id from customers where user_id = v_user_id;
  if v_customer_id is null then
    if v_order.customer_id is not null then
      update customers set user_id = v_user_id
      where id = v_order.customer_id and user_id is null
      returning id into v_customer_id;
    end if;
  end if;
  if v_customer_id is null then
    insert into customers (user_id, name, email, mobile)
    values (v_user_id, v_order.customer_name, v_order.customer_email, v_order.customer_mobile)
    returning id into v_customer_id;
  end if;

  update orders
     set user_id = v_user_id,
         customer_id = coalesce(customer_id, v_customer_id)
   where id = v_order.id;

  return jsonb_build_object(
    'order_number', v_order.order_number,
    'total_amount', v_order.total_amount,
    'order_status', v_order.order_status
  );
end;
$fn$;

revoke execute on function public.claim_order(text, text) from public, anon;
grant execute on function public.claim_order(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A customer maintaining their own profile
-- ---------------------------------------------------------------------------
create or replace function public.upsert_my_customer(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_id      uuid;
  v_name    text := nullif(trim(p_data->>'name'), '');
  v_mobile  text := nullif(trim(p_data->>'mobile'), '');
begin
  if v_user_id is null then
    raise exception 'Please sign in first' using errcode = 'P0001';
  end if;
  if v_name is null then
    raise exception 'Name is required' using errcode = 'P0001';
  end if;
  if v_mobile is not null and not public.pr_valid_mobile(v_mobile) then
    raise exception 'Enter a valid 10-digit Indian mobile number' using errcode = 'P0001';
  end if;

  select id into v_id from customers where user_id = v_user_id;

  if v_id is null then
    insert into customers (user_id, name, email, mobile, address, city, state, pincode)
    values (v_user_id, v_name,
            nullif(trim(p_data->>'email'), ''), v_mobile,
            nullif(trim(p_data->>'address'), ''),
            nullif(trim(p_data->>'city'), ''),
            nullif(trim(p_data->>'state'), ''),
            nullif(trim(p_data->>'pincode'), ''))
    returning id into v_id;
  else
    update customers
       set name    = v_name,
           email   = coalesce(nullif(trim(p_data->>'email'), ''), email),
           mobile  = coalesce(v_mobile, mobile),
           address = coalesce(nullif(trim(p_data->>'address'), ''), address),
           city    = coalesce(nullif(trim(p_data->>'city'), ''), city),
           state   = coalesce(nullif(trim(p_data->>'state'), ''), state),
           pincode = coalesce(nullif(trim(p_data->>'pincode'), ''), pincode)
     where id = v_id;
  end if;

  return jsonb_build_object('id', v_id);
end;
$fn$;

revoke execute on function public.upsert_my_customer(jsonb) from public, anon;
grant execute on function public.upsert_my_customer(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- A new sign-up gets a customer record automatically
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- An admin is created through the dashboard, not the storefront; skip those.
  if exists (select 1 from public.admin_users a where a.user_id = new.id) then
    return new;
  end if;

  insert into public.customers (user_id, name, email, mobile)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(trim(new.raw_user_meta_data->>'mobile'), '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
