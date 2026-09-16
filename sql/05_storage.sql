-- ============================================================================
-- PowerRun Industries - Production schema migration (05 / storage)
--
-- Kept in its own file on purpose: creating policies on storage.objects needs
-- privileges on the storage schema. If that is refused, it must not roll back
-- the core schema/RLS migration, so run this one separately.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STORAGE : product-images bucket. Public read, admin-only write.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

do $do$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname like 'product_images_%' loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end;
$do$;

create policy product_images_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'product-images');

create policy product_images_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

create policy product_images_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

create policy product_images_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
