-- 53: close the online shop (site_settings.site_closed) - and open it again
--
-- While site_settings 'site_closed' has {"closed": true}:
--   - nobody but an admin can place an order (trigger on orders),
--   - PI links can not start an online payment,
--   - products, categories, product images and reviews are not readable by the
--     public (anon / customers) - Admin still sees everything.
-- The static pages are closed by scripts/site_mode.py. Reopen: python scripts/site_mode.py open
-- (it sets closed to false here too). Nothing is deleted.
-- Rollback: sql/53_site_closed_rollback.sql

insert into public.site_settings (key, value)
values ('site_closed', jsonb_build_object('closed', true, 'since', now()))
on conflict (key) do update set value = excluded.value;

create or replace function public.pr_site_closed()
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce((select (value->>'closed')::boolean from site_settings where key = 'site_closed'), false)
$fn$;
revoke execute on function public.pr_site_closed() from public;
grant execute on function public.pr_site_closed() to anon, authenticated;

-- orders
create or replace function public.pr_block_orders_when_closed()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if public.pr_site_closed() and not public.is_admin() then
    raise exception 'Online orders band hain' using errcode = 'P0001';
  end if;
  return new;
end;
$fn$;
revoke execute on function public.pr_block_orders_when_closed() from public, anon, authenticated;
drop trigger if exists orders_block_when_closed on public.orders;
create trigger orders_block_when_closed before insert on public.orders
  for each row execute function public.pr_block_orders_when_closed();

-- PI online payment (migration 49 + the closed check)
create or replace function public.pi_start_online_payment(p_token uuid, p_full boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v orders%rowtype;
  v_pay jsonb := coalesce((select value from site_settings where key = 'payments'), '{}'::jsonb);
  v_pct numeric := least(greatest(coalesce(nullif(v_pay->>'advance_percent', '')::numeric, 50), 1), 100);
  v_below numeric := greatest(coalesce(nullif(v_pay->>'full_online_below', '')::numeric, 0), 0);
  v_adv numeric;
begin
  if public.pr_site_closed() then
    raise exception 'Online payment band hai' using errcode = 'P0001';
  end if;
  select * into v from orders where pi_token = p_token for update;
  if not found then
    raise exception 'This PI link is not valid' using errcode = 'P0001';
  end if;
  if v.order_status in ('cancelled', 'delivered') then
    raise exception 'This order can not be paid online - please call or WhatsApp us' using errcode = 'P0001';
  end if;
  if v.payment_status = 'paid' then
    return jsonb_build_object('order_number', v.order_number, 'status', 'already_paid');
  end if;
  if coalesce(v.advance_amount, 0) > 0 then
    raise exception 'Advance already received - the rest is paid on delivery' using errcode = 'P0001';
  end if;

  if p_full then
    update orders set payment_method = 'razorpay',
           notes = case when v.payment_method = 'razorpay' then notes
                        else trim(coalesce(notes, '') || ' [Customer chose full online payment from the PI]') end
     where id = v.id;
  else
    if coalesce((v_pay->>'advance_enabled')::boolean, true) is false or v.total_amount < v_below then
      raise exception 'This order has to be paid fully online' using errcode = 'P0001';
    end if;
    v_adv := case when v.advance_required > 0 and v.advance_required < v.total_amount then v.advance_required
                  else least(ceil(v.total_amount * v_pct / 100), v.total_amount) end;
    update orders set payment_method = 'advance_cod', advance_required = v_adv,
           notes = case when v.payment_method = 'advance_cod' then notes
                        else trim(coalesce(notes, '') || ' [Customer chose ' || v_pct || '% advance online from the PI]') end
     where id = v.id;
  end if;

  select * into v from orders where id = v.id;
  return jsonb_build_object(
    'order_id', v.id, 'order_number', v.order_number,
    'payment_method', v.payment_method,
    'amount', case when v.payment_method = 'advance_cod' then v.advance_required else v.total_amount end,
    'status', 'ready');
end;
$fn$;
revoke execute on function public.pi_start_online_payment(uuid, boolean) from public;
grant execute on function public.pi_start_online_payment(uuid, boolean) to anon, authenticated;

-- catalogue hidden from the public while closed
drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select to anon, authenticated
  using (((is_active is true) and not public.pr_site_closed()) or public.is_admin());

drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories for select to anon, authenticated
  using (((is_active is true) and not public.pr_site_closed()) or public.is_admin());

drop policy if exists product_images_public_read on public.product_images;
create policy product_images_public_read on public.product_images for select to anon, authenticated
  using (public.is_admin() or (not public.pr_site_closed() and exists (
    select 1 from public.products p where p.id = product_images.product_id and p.is_active is true)));

drop policy if exists product_reviews_public_read on public.product_reviews;
create policy product_reviews_public_read on public.product_reviews for select to anon, authenticated
  using (status = 'approved' and not public.pr_site_closed());
