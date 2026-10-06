-- ============================================================================
-- PowerRun Industries - migration 28 / quote follow-up reminders
--
-- Two days after a quotation is sent, if the customer has not ordered yet,
-- the daily job creates a follow-up (10:00 IST that day) so sales calls the
-- customer before the lead goes cold. Runs inside pr_quotation_expiry_job()
-- (01:00 IST, from migration 27), so no new cron job.
--
--   * quotations.sent_at records when a quote last became 'sent' (set by a
--     trigger, so Mark Sent, the editor and the website flow all count).
--   * quotations.followup_reminder_at stops a second reminder for the same
--     sending; re-sending a quote clears it.
--   * No reminder when the quote was converted, the customer placed any order
--     after it was sent, or the quote expires today or earlier (the expiry
--     reminder from migration 27 covers that case).
--
-- Additive and idempotent. Safe to run more than once.
-- ============================================================================

alter table public.quotations add column if not exists sent_at timestamptz;
alter table public.quotations add column if not exists followup_reminder_at timestamptz;

-- Backfill quotes that are already sent: last 'sent' entry in the audit log,
-- else the last update.
update public.quotations q
   set sent_at = coalesce(
         (select max(l.created_at) from public.quotation_audit_log l
           where l.quotation_id = q.id and l.action = 'status_changed' and l.new_value = 'sent'),
         q.updated_at, q.created_at)
 where q.status = 'sent' and q.sent_at is null;

-- Quotes already older than two days are not reminded retroactively; only
-- quotes sent from now on (or re-sent) get the automatic follow-up.
update public.quotations
   set followup_reminder_at = now()
 where status = 'sent' and followup_reminder_at is null
   and sent_at < now() - interval '2 days';

create or replace function public.quotations_track_sent()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    new.sent_at := now();
    new.followup_reminder_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists quotations_track_sent on public.quotations;
create trigger quotations_track_sent before insert or update on public.quotations
  for each row execute function public.quotations_track_sent();

create or replace function public.pr_quotation_expiry_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_today     date := (now() at time zone 'Asia/Kolkata')::date;
  v_reminders integer;
  v_followups integer;
  v_expired   integer;
begin
  -- 1. last valid day: call before the quote lapses (migration 27)
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

  -- 2. sent two days ago and still no order: follow up
  with due as (
    update public.quotations q
       set followup_reminder_at = now()
     where q.status = 'sent'
       and q.followup_reminder_at is null
       and q.sent_at is not null
       and (q.sent_at at time zone 'Asia/Kolkata')::date <= v_today - 2
       and (q.valid_until is null or q.valid_until > v_today)
       and q.converted_order_id is null
       and q.customer_id is not null
       and not exists (
         select 1 from public.orders o
          where o.created_at >= q.sent_at
            and o.order_status <> 'cancelled'
            and (o.customer_id = q.customer_id
                 or (q.customer_mobile is not null
                     and public.pr_norm_mobile(o.customer_mobile) = public.pr_norm_mobile(q.customer_mobile))))
    returning q.quote_number, q.customer_id, q.customer_name, q.customer_mobile, q.total_amount, q.valid_until
  )
  insert into public.follow_ups (customer_id, title, notes, due_at)
  select customer_id,
         'Follow up on quote ' || quote_number,
         coalesce(customer_name, 'Customer') ||
           coalesce(' (' || customer_mobile || ')', '') ||
           ' has not ordered since the quote was sent 2 days ago. Total Rs. ' ||
           to_char(coalesce(total_amount, 0), 'FM99,99,99,990') ||
           coalesce(', valid until ' || to_char(valid_until, 'DD Mon YYYY'), '') ||
           '. Call or WhatsApp to answer questions and close the order.',
         (v_today + time '10:00') at time zone 'Asia/Kolkata'
    from due;
  get diagnostics v_followups = row_count;

  -- 3. past valid_until: mark expired (migration 27)
  with gone as (
    update public.quotations
       set status = 'expired'
     where status = 'sent' and valid_until is not null and valid_until < v_today
    returning id
  )
  insert into public.quotation_audit_log (quotation_id, admin_name_snapshot, action, old_value, new_value)
  select id, 'System (auto-expiry)', 'status_changed', 'sent', 'expired' from gone;
  get diagnostics v_expired = row_count;

  return jsonb_build_object('reminders', v_reminders, 'followups', v_followups, 'expired', v_expired);
end;
$fn$;

revoke all on function public.pr_quotation_expiry_job() from public, anon, authenticated;
