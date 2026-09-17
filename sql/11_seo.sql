-- ============================================================================
-- PowerRun Industries - migration 11 / SEO management
--
-- Everything the SEO Manager in the admin panel edits lives here:
--
--   global_seo   one row, site-wide defaults (title, description, OG, GSC, GA,
--                robots.txt body, canonical base)
--   page_seo     one row per real route that already exists on the site
--   products     extra SEO columns (the existing meta_title / meta_description
--                / slug columns are reused, not duplicated)
--   categories   extra SEO columns
--   product_images.alt_text   per-image ALT text
--
-- RLS: anyone (including search engines through the public API) may READ SEO
-- data; only an admin (public.is_admin()) may write it.
--
-- Additive and idempotent. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. GLOBAL SEO (single row, id = 1)
-- ---------------------------------------------------------------------------
create table if not exists public.global_seo (
  id                smallint primary key default 1 check (id = 1),
  site_name         text,
  meta_title        text,
  meta_description  text,
  keywords          text,
  site_url          text,
  og_title          text,
  og_description    text,
  og_image          text,
  twitter_image     text,
  favicon_url       text,
  gsc_verification  text,
  ga_measurement_id text,
  robots_txt        text,
  default_canonical text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. PAGE SEO (one row per existing route)
-- ---------------------------------------------------------------------------
create table if not exists public.page_seo (
  id               uuid primary key default gen_random_uuid(),
  page_key         text not null unique,          -- matches PR.seo.apply(key)
  page_name        text not null,
  path             text not null,                 -- real route, e.g. /about/
  title            text,
  description      text,
  keywords         text,
  canonical_url    text,
  og_title         text,
  og_description   text,
  og_image         text,
  seo_index        boolean not null default true,
  seo_follow       boolean not null default true,
  in_sitemap       boolean not null default true,
  sitemap_priority numeric(2,1) not null default 0.8,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists page_seo_sort_idx on public.page_seo (sort_order, page_name);

-- ---------------------------------------------------------------------------
-- 3. PRODUCT SEO COLUMNS (meta_title / meta_description / slug already exist)
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists focus_keyword      text;
alter table public.products add column if not exists secondary_keywords text;
alter table public.products add column if not exists canonical_url      text;
alter table public.products add column if not exists og_title           text;
alter table public.products add column if not exists og_description     text;
alter table public.products add column if not exists og_image           text;
alter table public.products add column if not exists image_alt          text;
alter table public.products add column if not exists seo_index          boolean not null default true;
alter table public.products add column if not exists seo_follow         boolean not null default true;

-- ---------------------------------------------------------------------------
-- 4. CATEGORY SEO COLUMNS
-- ---------------------------------------------------------------------------
alter table public.categories add column if not exists meta_title       text;
alter table public.categories add column if not exists meta_description text;
alter table public.categories add column if not exists focus_keyword    text;
alter table public.categories add column if not exists canonical_url    text;
alter table public.categories add column if not exists og_image         text;
alter table public.categories add column if not exists seo_index        boolean not null default true;
alter table public.categories add column if not exists seo_follow       boolean not null default true;

-- ---------------------------------------------------------------------------
-- 5. IMAGE ALT TEXT
-- ---------------------------------------------------------------------------
alter table public.product_images add column if not exists alt_text text;

-- ---------------------------------------------------------------------------
-- 6. updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.seo_touch_updated_at()
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

drop trigger if exists global_seo_touch on public.global_seo;
create trigger global_seo_touch before update on public.global_seo
  for each row execute function public.seo_touch_updated_at();

drop trigger if exists page_seo_touch on public.page_seo;
create trigger page_seo_touch before update on public.page_seo
  for each row execute function public.seo_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7. RLS : public read, admin write
-- ---------------------------------------------------------------------------
alter table public.global_seo enable row level security;
alter table public.page_seo  enable row level security;

do $do$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('global_seo', 'page_seo') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$do$;

create policy global_seo_public_read on public.global_seo
  for select to anon, authenticated using (true);
create policy global_seo_admin_write on public.global_seo
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy page_seo_public_read on public.page_seo
  for select to anon, authenticated using (true);
create policy page_seo_admin_write on public.page_seo
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.global_seo, public.page_seo from anon;
grant select on public.global_seo, public.page_seo to anon;
grant select on public.global_seo, public.page_seo to authenticated;
grant insert, update, delete on public.global_seo, public.page_seo to authenticated;

-- ---------------------------------------------------------------------------
-- 8. SEED : global defaults + one row per route that already exists
--    Only fills a row if it is missing; existing values are never overwritten.
-- ---------------------------------------------------------------------------
insert into public.global_seo (id, site_name, meta_title, meta_description, keywords, site_url,
                               og_title, og_description, og_image, twitter_image, favicon_url,
                               robots_txt, default_canonical)
values (
  1,
  'PowerRun Industries',
  'PowerRun Industries | Lithium Batteries, Hybrid Inverters & Solar Energy Solutions',
  'PowerRun Industries supplies lithium batteries, hybrid solar inverters, solar panels and e-rickshaw batteries for homes, businesses and mobility across India.',
  'lithium battery, hybrid solar inverter, solar panel, e-rickshaw battery, solar battery, PowerRun Industries',
  'https://powerrun.in',
  'PowerRun Industries | Lithium Batteries, Hybrid Inverters & Solar Energy Solutions',
  'Lithium batteries, hybrid solar inverters, solar panels and e-rickshaw batteries from PowerRun Industries.',
  'https://powerrun.in/assets/powerrun-logo.png',
  'https://powerrun.in/assets/powerrun-logo.png',
  '/assets/powerrun-logo.png',
  null,
  'https://powerrun.in'
)
on conflict (id) do nothing;

insert into public.page_seo (page_key, page_name, path, title, description, seo_index, seo_follow,
                             in_sitemap, sitemap_priority, sort_order)
values
  ('home', 'Home', '/',
   'PowerRun Industries | Lithium Batteries, Hybrid Inverters & Solar Energy Solutions',
   'PowerRun Industries supplies lithium batteries, hybrid solar inverters, solar panels and e-rickshaw batteries for homes, businesses and mobility across India.',
   true, true, true, 1.0, 1),
  ('products', 'All Products', '/products/',
   'Solar Inverters, Lithium Batteries & Solar Panels | PowerRun Industries',
   'Browse the full PowerRun Industries range: hybrid solar inverters, lithium batteries, solar panels and e-rickshaw batteries, with pan-India delivery.',
   true, true, true, 0.9, 2),
  ('about', 'About Us', '/about/',
   'About PowerRun Industries | Energy Storage & Solar Manufacturer',
   'PowerRun Industries builds lithium batteries, hybrid solar inverters and solar energy systems for homes, businesses and electric mobility in India.',
   true, true, true, 0.7, 3),
  ('contact', 'Contact Us', '/contact/',
   'Contact PowerRun Industries | Sales & Technical Support',
   'Talk to PowerRun Industries about lithium batteries, hybrid solar inverters and solar panels. Call, WhatsApp or send an enquiry.',
   true, true, true, 0.7, 4),
  ('warranty', 'Warranty Registration', '/warranty/',
   'Warranty Registration | PowerRun Industries',
   'Register your PowerRun lithium battery, hybrid inverter or solar product for warranty support.',
   true, true, true, 0.6, 5),
  ('service', 'Service Request', '/service/',
   'Service Request | PowerRun Industries',
   'Raise a service request for your PowerRun battery, inverter or solar installation and track it online.',
   true, true, true, 0.6, 6),
  ('dealer', 'Dealership Enquiry', '/dealer/',
   'Become a Dealer | PowerRun Industries',
   'Partner with PowerRun Industries as a dealer or distributor for lithium batteries, hybrid solar inverters and solar panels.',
   true, true, true, 0.6, 7),
  ('track-order', 'Track Order', '/track-order/',
   'Track Your Order | PowerRun Industries',
   'Track a PowerRun Industries order with your order number and registered mobile number.',
   true, true, true, 0.4, 8),
  ('cart', 'Cart', '/cart/', 'Cart | PowerRun Industries', null, false, true, false, 0.1, 20),
  ('checkout', 'Checkout', '/checkout/', 'Checkout | PowerRun Industries', null, false, true, false, 0.1, 21),
  ('order-confirmation', 'Order Confirmation', '/order-confirmation/',
   'Order Confirmation | PowerRun Industries', null, false, true, false, 0.1, 22),
  ('account', 'My Account', '/account/', 'My Account | PowerRun Industries', null, false, true, false, 0.1, 23)
on conflict (page_key) do nothing;
