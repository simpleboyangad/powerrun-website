-- ============================================================================
-- PowerRun Industries - migration 10 / product datasheets
--
-- Each product can carry one downloadable datasheet (PDF), uploaded from the
-- admin panel and linked from the product page.
--
--   * products.datasheet_url / datasheet_path / datasheet_name
--   * storage bucket "product-datasheets": public read, admin-only write,
--     PDF only, 20 MB per file
--
-- Safe to run more than once.
-- ============================================================================

alter table public.products add column if not exists datasheet_url  text;
alter table public.products add column if not exists datasheet_path text;
alter table public.products add column if not exists datasheet_name text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-datasheets', 'product-datasheets', true, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $do$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname like 'product_datasheets_%' loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end;
$do$;

create policy product_datasheets_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'product-datasheets');

create policy product_datasheets_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-datasheets' and public.is_admin());

create policy product_datasheets_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'product-datasheets' and public.is_admin())
  with check (bucket_id = 'product-datasheets' and public.is_admin());

create policy product_datasheets_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-datasheets' and public.is_admin());
