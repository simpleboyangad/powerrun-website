-- PowerRun Industries - safe production hardening
-- Run this ONLY after reviewing the existing Supabase policies.
-- It does not drop tables or delete production data.

-- 1) Public read access for catalogue data.
-- Existing policy names are replaced only if they already have these names.
drop policy if exists "public_read_active_categories" on public.categories;
create policy "public_read_active_categories" on public.categories
for select to anon, authenticated
using (is_active = true);

drop policy if exists "public_read_active_products" on public.products;
create policy "public_read_active_products" on public.products
for select to anon, authenticated
using (is_active = true);

drop policy if exists "public_read_product_images" on public.product_images;
create policy "public_read_product_images" on public.product_images
for select to anon, authenticated
using (exists (select 1 from public.products p where p.id = product_images.product_id and p.is_active = true));

-- 2) Admin authorization helper.
-- Admin users are linked to Supabase Auth user IDs through admin_users.user_id.
-- Do not create a frontend password check; Supabase Auth remains the source of truth.
drop policy if exists "admin_read_admin_users" on public.admin_users;
create policy "admin_read_admin_users" on public.admin_users
for select to authenticated
using (auth.uid() = user_id);

-- 3) Admin-only catalogue mutations.
drop policy if exists "admin_manage_products" on public.products;
create policy "admin_manage_products" on public.products
for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "admin_manage_product_images" on public.product_images;
create policy "admin_manage_product_images" on public.product_images
for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

-- 4) Admin order/lead access. Public users do NOT get SELECT access to customer records.
drop policy if exists "admin_read_orders" on public.orders;
create policy "admin_read_orders" on public.orders
for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "admin_update_orders" on public.orders;
create policy "admin_update_orders" on public.orders
for update to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "admin_read_order_items" on public.order_items;
create policy "admin_read_order_items" on public.order_items
for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "admin_read_leads" on public.leads;
create policy "admin_read_leads" on public.leads
for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "admin_update_leads" on public.leads;
create policy "admin_update_leads" on public.leads
for update to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

-- 5) Public lead/enquiry creation is intentionally limited to INSERT only.
drop policy if exists "public_create_leads" on public.leads;
create policy "public_create_leads" on public.leads
for insert to anon, authenticated
with check (status = 'new' and source = 'website');

-- 6) Secure public order creation through a SECURITY DEFINER RPC.
-- This avoids granting the public role SELECT access to customer orders just to retrieve the new order ID.
create or replace function public.create_public_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id orders.id%TYPE;
  v_order_number text := payload->>'order_number';
  item jsonb;
begin
  if coalesce(payload->>'customer_name','') = '' or coalesce(payload->>'customer_mobile','') = '' then
    raise exception 'Customer name and mobile are required';
  end if;

  insert into public.orders (
    order_number, customer_name, customer_mobile, customer_email,
    address, city, state, pincode, subtotal, total_amount,
    payment_status, order_status, payment_method
  ) values (
    v_order_number,
    payload->>'customer_name',
    payload->>'customer_mobile',
    nullif(payload->>'customer_email',''),
    nullif(payload->>'address',''),
    nullif(payload->>'city',''),
    nullif(payload->>'state',''),
    nullif(payload->>'pincode',''),
    coalesce((payload->>'subtotal')::numeric, 0),
    coalesce((payload->>'total_amount')::numeric, 0),
    'pending', 'new', 'enquiry'
  ) returning id into v_order_id;

  for item in select * from jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) loop
    insert into public.order_items (
      order_id, product_id, product_name, quantity, unit_price, total_price
    ) values (
      v_order_id,
      (item->>'product_id')::uuid,
      item->>'product_name',
      greatest(1, coalesce((item->>'quantity')::integer,1)),
      coalesce((item->>'unit_price')::numeric,0),
      coalesce((item->>'total_price')::numeric,0)
    );
  end loop;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
end;
$$;

grant execute on function public.create_public_order(jsonb) to anon, authenticated;

-- IMPORTANT:
-- The RPC above assumes orders.id is UUID because product IDs/order IDs in the existing
-- integration are UUID-shaped. If your existing order_items.product_id/order_id types differ,
-- inspect the actual schema before running this function. Do not blindly run it if the types differ.

-- 7) Product image bucket: keep public read, admin-only write/delete.
-- If the bucket already exists, the insert below does nothing.
insert into storage.buckets (id, name, public)
values ('product-images','product-images',true)
on conflict (id) do nothing;

drop policy if exists "public_read_product_images_storage" on storage.objects;
create policy "public_read_product_images_storage" on storage.objects
for select to anon, authenticated
using (bucket_id = 'product-images');

drop policy if exists "admin_insert_product_images_storage" on storage.objects;
create policy "admin_insert_product_images_storage" on storage.objects
for insert to authenticated
with check (bucket_id = 'product-images' and exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "admin_delete_product_images_storage" on storage.objects;
create policy "admin_delete_product_images_storage" on storage.objects
for delete to authenticated
using (bucket_id = 'product-images' and exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

-- 8) Optional category seed. Safe: only inserts missing names.
insert into public.categories (name, is_active, sort_order)
select v.name, true, v.sort_order
from (values
  ('Hybrid Inverters',1),('Lithium Batteries',2),('Solar Panels',3),('E-Rickshaw Batteries',4),
  ('Home Energy Storage',5),('Commercial Energy Storage',6),('Industrial Energy Solutions',7),
  ('EV Batteries',8),('UPS & Power Backup',9),('Accessories & Spare Parts',10)
) v(name,sort_order)
where not exists (select 1 from public.categories c where lower(c.name)=lower(v.name));
