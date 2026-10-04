-- ============================================================================
-- PowerRun Industries - migration 27 / review links + quotation auto-expiry
--
-- A. Review links. Every order gets a random review_token. Once an order is
--    delivered, the admin sends the customer /review/?t=<token> on WhatsApp;
--    the page lists the products in that order and the customer can review
--    each one - no account needed (most orders are guest checkouts). Reviews
--    still land as 'pending' and only go public after admin approval, and a
--    review can only ever be written for a product that was really delivered
--    in that order.
--
-- B. Quotation expiry. A daily pg_cron job (01:00 IST):
--    - on a sent quote's last valid day, creates a follow-up for 10:00 that
--      day so sales can call the customer before it lapses;
--    - once valid_until has passed, marks the quote 'expired' and logs it.
--    Changing valid_until clears the reminder flag, so an extended quote gets
--    a fresh reminder.
--
-- Additive and idempotent. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. Review links
-- ---------------------------------------------------------------------------
alter table public.product_reviews alter column user_id drop not null;

alter table public.orders add column if not exists review_token uuid;
update public.orders set review_token = gen_random_uuid() where review_token is null;
alter table public.orders alter column review_token set default gen_random_uuid();
alter table public.orders alter column review_token set not null;
create unique index if not exists orders_review_token_idx on public.orders(review_token);

-- one review per product per order
create unique index if not exists product_reviews_order_product_idx
  on public.product_reviews(order_id, product_id) where order_id is not null;

create or replace function public.get_review_request(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_order public.orders%rowtype;
  v_items jsonb;
begin
  select * into v_order from public.orders where review_token = p_token;
  if not found then
    raise exception 'This review link is not valid.' using errcode = 'P0001';
  end if;
  if v_order.order_status <> 'delivered' then
    raise exception 'You can write a review once your order has been delivered.' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', p.id,
           'name', p.name,
           'slug', p.slug,
           'image', (select pi.image_url from public.product_images pi
                      where pi.product_id = p.id order by pi.sort_order limit 1),
           'reviewed', exists (select 1 from public.product_reviews r
                                where r.product_id = p.id
                                  and (r.order_id = v_order.id
                                       or (v_order.user_id is not null and r.user_id = v_order.user_id)))
         ) order by p.name), '[]'::jsonb)
    into v_items
    from (select distinct product_id from public.order_items
           where order_id = v_order.id and product_id is not null) oi
    join public.products p on p.id = oi.product_id;

  return jsonb_build_object(
    'order_number', v_order.order_number,
    'name', split_part(trim(coalesce(v_order.customer_name, '')), ' ', 1),
    'items', v_items);
end;
$fn$;

create or replace function public.submit_review_by_token(
  p_token uuid, p_product_id uuid, p_rating integer, p_title text, p_body text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order public.orders%rowtype;
  v_body  text := trim(coalesce(p_body, ''));
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_name  text := nullif(trim(coalesce(p_name, '')), '');
begin
  select * into v_order from public.orders where review_token = p_token;
  if not found then
    raise exception 'This review link is not valid.' using errcode = 'P0001';
  end if;
  if v_order.order_status <> 'delivered' then
    raise exception 'You can write a review once your order has been delivered.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.order_items
                  where order_id = v_order.id and product_id = p_product_id) then
    raise exception 'This product is not part of your order.' using errcode = 'P0001';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Please choose a rating from 1 to 5 stars.' using errcode = 'P0001';
  end if;
  if length(v_body) < 10 then
    raise exception 'Please write at least a few words about the product.' using errcode = 'P0001';
  end if;
  if length(v_body) > 2000 or length(coalesce(v_title, '')) > 120 or length(coalesce(v_name, '')) > 60 then
    raise exception 'Your review is too long.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.product_reviews r
              where r.product_id = p_product_id
                and (r.order_id = v_order.id
                     or (v_order.user_id is not null and r.user_id = v_order.user_id))) then
    raise exception 'You have already reviewed this product. Thank you!' using errcode = 'P0001';
  end if;

  insert into public.product_reviews (product_id, user_id, order_id, customer_name, rating, title, body, status)
  values (p_product_id, v_order.user_id, v_order.id,
          coalesce(v_name, split_part(trim(coalesce(v_order.customer_name, '')), ' ', 1), 'Verified Buyer'),
          p_rating, v_title, v_body, 'pending');

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    raise exception 'You have already reviewed this product. Thank you!' using errcode = 'P0001';
end;
$fn$;

revoke all on function public.get_review_request(uuid) from public;
revoke all on function public.submit_review_by_token(uuid, uuid, integer, text, text, text) from public;
grant execute on function public.get_review_request(uuid) to anon, authenticated;
grant execute on function public.submit_review_by_token(uuid, uuid, integer, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- B. Quotation auto-expiry
-- ---------------------------------------------------------------------------
alter table public.quotations add column if not exists expiry_reminder_at timestamptz;

create or replace function public.quotations_reset_expiry_reminder()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.valid_until is distinct from old.valid_until then
    new.expiry_reminder_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists quotations_reset_expiry_reminder on public.quotations;
create trigger quotations_reset_expiry_reminder before update on public.quotations
  for each row execute function public.quotations_reset_expiry_reminder();

create or replace function public.pr_quotation_expiry_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_today     date := (now() at time zone 'Asia/Kolkata')::date;
  v_reminders integer;
  v_expired   integer;
begin
  with due as (
    update public.quotations
       set expiry_reminder_at = now()
     where status = 'sent' and valid_until is not null
       and valid_until <= v_today and expiry_reminder_at is null
    returning quote_number, customer_id, customer_name, total_amount, valid_until
  )
  insert into public.follow_ups (customer_id, title, notes, due_at)
  select customer_id,
         'Quote ' || quote_number ||
           case when valid_until < v_today then ' expire ho gaya' else ' aaj expire ho raha hai' end,
         coalesce(customer_name, 'Customer') || ' se baat karein (total Rs. ' ||
           to_char(coalesce(total_amount, 0), 'FM99,99,99,990') ||
           '). Zarurat ho to validity badha kar dobara bhejein.',
         (v_today + time '10:00') at time zone 'Asia/Kolkata'
    from due;
  get diagnostics v_reminders = row_count;

  with gone as (
    update public.quotations
       set status = 'expired'
     where status = 'sent' and valid_until is not null and valid_until < v_today
    returning id
  )
  insert into public.quotation_audit_log (quotation_id, admin_name_snapshot, action, old_value, new_value)
  select id, 'System (auto-expiry)', 'status_changed', 'sent', 'expired' from gone;
  get diagnostics v_expired = row_count;

  return jsonb_build_object('reminders', v_reminders, 'expired', v_expired);
end;
$fn$;

revoke all on function public.pr_quotation_expiry_job() from public, anon, authenticated;

create extension if not exists pg_cron;

-- 19:30 UTC = 01:00 IST, every day. cron.schedule() replaces a job of the same name.
select cron.schedule('pr-quotation-expiry', '30 19 * * *', 'select public.pr_quotation_expiry_job()');
