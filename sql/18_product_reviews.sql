-- ============================================================================
-- PowerRun Industries - migration 18 / Product Reviews (verified purchase)
--
-- Resolves the Search Console "Product snippets missing review/aggregateRating"
-- notice with real data: only a customer with a DELIVERED order containing
-- the product can review it, an admin approves/rejects before it goes
-- public, and scripts/seo_build.py only ever writes aggregateRating/review
-- into a product's schema once it has real approved reviews. No seeded or
-- fabricated ratings anywhere.
--
-- Additive and idempotent. Safe to run more than once.
-- ============================================================================

create table if not exists public.product_reviews (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  order_id      uuid references public.orders(id) on delete set null,
  customer_name text,
  rating        smallint not null check (rating between 1 and 5),
  title         text,
  body          text not null,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (product_id, user_id)
);

create index if not exists product_reviews_product_idx on public.product_reviews(product_id);
create index if not exists product_reviews_status_idx  on public.product_reviews(status);

create or replace function public.product_reviews_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists product_reviews_touch on public.product_reviews;
create trigger product_reviews_touch before update on public.product_reviews
  for each row execute function public.product_reviews_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.product_reviews enable row level security;

do $do$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename = 'product_reviews' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$do$;

-- Anyone (including anon) can read approved reviews.
create policy product_reviews_public_read on public.product_reviews
  for select to anon, authenticated
  using (status = 'approved');

-- A signed-in customer can also see their own review regardless of status;
-- an admin can see everything.
create policy product_reviews_owner_read on public.product_reviews
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- A customer may insert a review only for a product from one of their own
-- DELIVERED orders, and only ever as 'pending' - the eligibility gate is
-- enforced by Postgres, not just the client.
create policy product_reviews_owner_insert on public.product_reviews
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.product_id = product_reviews.product_id
        and o.user_id = auth.uid()
        and o.order_status = 'delivered'
    )
  );

-- Admin moderation (approve/reject/delete).
create policy product_reviews_admin_all on public.product_reviews
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.product_reviews from anon, authenticated;
grant select on public.product_reviews to anon;
grant select, insert on public.product_reviews to authenticated;
-- Admin update/delete comes from being `authenticated` + the admin policy above.
grant update, delete on public.product_reviews to authenticated;

-- ---------------------------------------------------------------------------
-- Sidebar badge: how many reviews are waiting for moderation.
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'total_products',    (select count(*) from products),
    'active_products',   (select count(*) from products where is_active),
    'total_orders',      (select count(*) from orders),
    'pending_orders',    (select count(*) from orders where order_status = 'pending'),
    'processing_orders', (select count(*) from orders where order_status = 'processing'),
    'confirmed_orders',  (select count(*) from orders where order_status = 'confirmed'),
    'shipped_orders',    (select count(*) from orders where order_status = 'shipped'),
    'completed_orders',  (select count(*) from orders where order_status = 'delivered'),
    'cancelled_orders',  (select count(*) from orders where order_status = 'cancelled'),
    'total_customers',   (select count(*) from customers),
    'warranty_requests', (select count(*) from warranties),
    'warranty_pending',  (select count(*) from warranties where status = 'pending'),
    'service_requests',  (select count(*) from service_tickets),
    'service_open',      (select count(*) from service_tickets where status = 'open'),
    'dealer_enquiries',  (select count(*) from dealer_enquiries),
    'dealer_new',        (select count(*) from dealer_enquiries where status = 'new'),
    'leads',             (select count(*) from leads),
    'revenue_paid',      (select coalesce(sum(total_amount), 0) from orders where payment_status = 'paid'),
    'revenue_total',     (select coalesce(sum(total_amount), 0) from orders where order_status <> 'cancelled'),
    'low_stock',         (select count(*) from products where is_active and coalesce(stock, 0) <= 5),
    'reviews_pending',   (select count(*) from product_reviews where status = 'pending')
  );
end;
$fn$;

revoke execute on function public.admin_dashboard_stats() from public;
grant execute on function public.admin_dashboard_stats() to authenticated;
