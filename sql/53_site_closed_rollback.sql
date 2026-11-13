-- rollback for 53_site_closed.sql: back to the policies of before, shop open
update public.site_settings set value = jsonb_build_object('closed', false) where key = 'site_closed';
drop trigger if exists orders_block_when_closed on public.orders;
drop function if exists public.pr_block_orders_when_closed();

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select to anon, authenticated
  using ((is_active is true) or public.is_admin());
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories for select to anon, authenticated
  using ((is_active is true) or public.is_admin());
drop policy if exists product_images_public_read on public.product_images;
create policy product_images_public_read on public.product_images for select to anon, authenticated
  using (public.is_admin() or exists (
    select 1 from public.products p where p.id = product_images.product_id and p.is_active is true));
drop policy if exists product_reviews_public_read on public.product_reviews;
create policy product_reviews_public_read on public.product_reviews for select to anon, authenticated
  using (status = 'approved');
-- pi_start_online_payment: re-run sql/49_pi_online_pay.sql; pr_site_closed() can stay
