-- ============================================================================
-- PowerRun Industries - Production schema migration (03 / RLS)
--
-- Every existing policy on these tables is dropped first, so that any legacy
-- permissive "allow all" policy cannot survive this migration. The canonical
-- set below is then recreated.
--
-- Rules enforced here:
--   * anon may READ active products / categories / product images only.
--   * anon has NO table-level write grant anywhere. Public writes (orders,
--     warranty, service, dealer, contact) go through SECURITY DEFINER RPCs.
--   * a signed-in customer may read ONLY their own orders and order items.
--   * everything else is admin-only, verified by public.is_admin() against the
--     admin_users table -- never by anything the browser can set.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS and clear legacy policies
-- ---------------------------------------------------------------------------
do $do$
declare
  t text;
  p record;
  tables text[] := array[
    'products','categories','product_images','orders','order_items','customers',
    'customer_addresses','admin_users','leads','warranties','service_tickets',
    'dealer_enquiries','site_settings','shipments','delivery_timeline',
    'invoices','notifications','contact_messages'
  ];
begin
  foreach t in array tables loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      -- NOTE: deliberately ENABLE but never FORCE. Forcing would also subject
      -- the table owner to these policies, which would break the SECURITY
      -- DEFINER submit_*/create_website_order functions that insert here.
      execute format('alter table public.%I enable row level security', t);
      execute format('alter table public.%I no force row level security', t);
      for p in select policyname from pg_policies
               where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', p.policyname, t);
      end loop;
    end if;
  end loop;
end;
$do$;

-- Revoke any direct table grants anon may have picked up along the way.
revoke all on all tables in schema public from anon;
grant select on public.products, public.categories, public.product_images,
                public.site_settings to anon;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on
  public.products, public.categories, public.product_images, public.orders,
  public.order_items, public.customers, public.leads, public.warranties,
  public.service_tickets, public.dealer_enquiries, public.site_settings,
  public.admin_users
to authenticated;

-- ---------------------------------------------------------------------------
-- CATALOGUE : public read of active rows, admin full control
-- ---------------------------------------------------------------------------
create policy categories_public_read on public.categories
  for select to anon, authenticated
  using (is_active is true or public.is_admin());

create policy categories_admin_write on public.categories
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy products_public_read on public.products
  for select to anon, authenticated
  using (is_active is true or public.is_admin());

create policy products_admin_write on public.products
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy product_images_public_read on public.product_images
  for select to anon, authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.products p
               where p.id = product_images.product_id and p.is_active is true)
  );

create policy product_images_admin_write on public.product_images
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- ORDERS : never readable by anon. Signed-in customers see only their own.
-- Public order placement happens through create_website_order() only.
-- ---------------------------------------------------------------------------
create policy orders_owner_read on public.orders
  for select to authenticated
  using (public.is_admin() or (user_id is not null and user_id = auth.uid()));

create policy orders_admin_write on public.orders
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy order_items_owner_read on public.order_items
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.orders o
               where o.id = order_items.order_id
                 and o.user_id is not null and o.user_id = auth.uid())
  );

create policy order_items_admin_write on public.order_items
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------------------------
create policy customers_owner_read on public.customers
  for select to authenticated
  using (public.is_admin() or (user_id is not null and user_id = auth.uid()));

create policy customers_admin_write on public.customers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- ADMIN USERS : a signed-in user may read only their own row (that is how the
-- admin panel confirms the session). Only an admin may change the table.
-- is_admin() is SECURITY DEFINER, so no policy recursion occurs here.
-- ---------------------------------------------------------------------------
create policy admin_users_self_read on public.admin_users
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy admin_users_admin_write on public.admin_users
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- ENQUIRY / SUPPORT TABLES : admin-only from the client side.
-- Customers write to them exclusively via the submit_* RPCs.
-- ---------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array['leads','warranties','service_tickets','dealer_enquiries'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin())',
      t || '_admin_read', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_write', t);
  end loop;
end;
$do$;

-- ---------------------------------------------------------------------------
-- SITE SETTINGS : readable by everyone (shipping rates shown at checkout),
-- writable by admins only.
-- ---------------------------------------------------------------------------
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated using (true);

create policy site_settings_admin_write on public.site_settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- FULFILMENT TABLES : admin-only, plus the owning customer where applicable.
-- ---------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array['customer_addresses','shipments','delivery_timeline','invoices','notifications','contact_messages'] loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
        t || '_admin_all', t);

      if exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = t and column_name = 'user_id') then
        execute format(
          'create policy %I on public.%I for select to authenticated using (user_id is not null and user_id = auth.uid())',
          t || '_owner_read', t);
      elsif exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t and column_name = 'order_id') then
        execute format(
          'create policy %I on public.%I for select to authenticated using (exists (select 1 from public.orders o where o.id = %I.order_id and o.user_id is not null and o.user_id = auth.uid()))',
          t || '_owner_read', t, t);
      end if;
    end if;
  end loop;
end;
$do$;
