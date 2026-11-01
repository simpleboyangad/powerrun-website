#!/usr/bin/env python
"""
PowerRun Industries - migration 48 (advance payment instead of COD) tests. STAGING ONLY.

    POWERRUN_PROJECT_REF=<staging ref> python scripts/tests/advance_staging_tests.py

Everything runs in one transaction that is always rolled back.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import supabase_admin as sa  # noqa: E402

if sa.PROJECT_REF == "nnkopxkyxcmtiunftlgr":
    sys.exit("Refusing to run against production.")

SQL = r"""
do $t$
declare
  small uuid;
  big uuid := (select id from products where is_active and price > 3000
                and availability not in ('out_of_stock', 'discontinued') and (availability <> 'in_stock' or stock >= 1)
                order by price limit 1);
  cust jsonb := '{"name":"Test Advance","mobile":"9999900001","address":"Test street","city":"Kasganj","state":"Uttar Pradesh","pincode":"207124"}';
  r jsonb := '{}';
  o jsonb;
  oid uuid;
  ord orders%rowtype;
  res text;
  err text;
begin
  -- a cheap product: advance works on small orders too (staging only has big ones; rolled back)
  insert into products (name, slug, price, mrp, gst_rate, is_active, availability, stock)
  values ('Test 48 small', 'test-48-small', 999, 999, 18, true, 'in_stock', 10) returning id into small;
  if big is null then raise exception 'no big product on staging'; end if;

  -- 1. plain COD is refused
  begin
    perform public.create_website_order(cust, jsonb_build_array(jsonb_build_object('product_id', big, 'quantity', 1)), 'cod', null);
    r := r || '{"cod_refused": false}';
  exception when others then r := r || jsonb_build_object('cod_refused', sqlerrm like '%not available%');
  end;

  -- 2. advance on a small order (no minimum amount): 50% of 999 = 500
  o := public.create_website_order(cust, jsonb_build_array(jsonb_build_object('product_id', small, 'quantity', 1)), 'advance_cod', null);
  r := r || jsonb_build_object('small_advance', (o ->> 'advance_required')::numeric, 'small_total', (o ->> 'total_amount')::numeric);

  -- 2b. a minimum set in Settings is enforced (setting changed inside this rolled-back test only)
  update site_settings set value = value || '{"full_online_below": 2000}' where key = 'payments';
  begin
    perform public.create_website_order(cust, jsonb_build_array(jsonb_build_object('product_id', small, 'quantity', 1)), 'advance_cod', null);
    r := r || '{"min_enforced": false}';
  exception when others then r := r || jsonb_build_object('min_enforced', sqlerrm like '%paid fully online%');
  end;
  update site_settings set value = value || '{"full_online_below": 0}' where key = 'payments';

  -- 3. small order online is fine, no advance
  o := public.create_website_order(cust, jsonb_build_array(jsonb_build_object('product_id', small, 'quantity', 1)), 'razorpay', null);
  r := r || jsonb_build_object('small_online_ok', o ? 'order_id', 'small_online_adv', o ->> 'advance_required');

  -- 4. big order with advance: 50% rounded up
  o := public.create_website_order(cust, jsonb_build_array(jsonb_build_object('product_id', big, 'quantity', 1)), 'advance_cod', null);
  oid := (o ->> 'order_id')::uuid;
  select * into ord from orders where id = oid;
  r := r || jsonb_build_object('adv_method', ord.payment_method, 'adv_total', ord.total_amount,
                               'adv_required', ord.advance_required, 'adv_expected', ceil(ord.total_amount / 2));

  -- 5. Razorpay webhook for exactly the advance
  update orders set razorpay_order_id = 'order_TEST48' where id = oid;
  res := public.pr_record_razorpay_payment('evt_test48_a', 'payment.captured', 'order_TEST48', 'pay_TEST48',
                                           round(ord.advance_required * 100)::bigint, 'INR');
  select * into ord from orders where id = oid;
  r := r || jsonb_build_object('webhook_result', res, 'after_adv_amount', ord.advance_amount,
                               'after_status', ord.order_status, 'after_pay_status', ord.payment_status,
                               'after_request', ord.payment_request);

  -- 6. PI link: nothing more as advance, the balance is what is left
  r := r || jsonb_build_object('pi_pay_now_after', (public.get_order_pi_public(ord.pi_token) ->> 'pay_now')::numeric,
                               'pi_balance_expected', ord.total_amount - ord.advance_amount);

  -- 7. full-online order switched to advance by the customer
  o := public.create_website_order(cust, jsonb_build_array(jsonb_build_object('product_id', big, 'quantity', 1)), 'razorpay', null);
  oid := (o ->> 'order_id')::uuid;
  o := public.switch_order_to_advance(oid, '9999900001');
  select * into ord from orders where id = oid;
  r := r || jsonb_build_object('switch_status', o ->> 'status', 'switch_method', ord.payment_method,
                               'switch_adv_ok', ord.advance_required = ceil(ord.total_amount / 2),
                               'pi_pay_now_before', (public.get_order_pi_public(ord.pi_token) ->> 'pay_now')::numeric = ord.advance_required);

  -- 8. switch to COD is refused now (fresh full-online order)
  o := public.create_website_order(cust, jsonb_build_array(jsonb_build_object('product_id', big, 'quantity', 1)), 'razorpay', null);
  begin
    perform public.switch_order_to_cod((o ->> 'order_id')::uuid, '9999900001');
    r := r || '{"switch_cod_refused": false}';
  exception when others then r := r || jsonb_build_object('switch_cod_refused', sqlerrm like '%not available%');
  end;

  -- 9. old pending COD orders got an advance to ask for
  r := r || jsonb_build_object(
    'old_cod_open', (select count(*) from orders where not is_test and coalesce(payment_method, 'cod') = 'cod'
                       and payment_status <> 'paid' and order_status in ('pending', 'confirmed', 'processing')),
    'old_cod_with_ask', (select count(*) from orders where not is_test and coalesce(payment_method, 'cod') = 'cod'
                       and payment_status <> 'paid' and order_status in ('pending', 'confirmed', 'processing') and advance_required > 0),
    'old_ask_rule_ok', not exists (select 1 from orders where not is_test and coalesce(payment_method, 'cod') = 'cod'
                       and payment_status <> 'paid' and order_status in ('pending', 'confirmed', 'processing')
                       and advance_required <> ceil(total_amount / 2)),
    'settings', (select value from site_settings where key = 'payments'));

  raise exception 'RESULT %', r;
end;
$t$;
"""

try:
    sa.run_sql(SQL)
    sys.exit("expected the rollback exception")
except SystemExit as e:
    msg = str(e)
    if "RESULT" not in msg:
        sys.exit(msg)
    blob = msg[msg.index("RESULT") + 7:].replace('\\"', '"')
    depth, end = 0, 0
    for i, ch in enumerate(blob):
        depth += ch == "{"
        depth -= ch == "}"
        if depth == 0 and ch == "}":
            end = i + 1
            break
    r = json.loads(blob[:end])

checks = [
    ("plain COD refused", r["cod_refused"] is True),
    ("advance on a small order = 50% rounded up", float(r["small_advance"]) == -(-float(r["small_total"]) // 2)),
    ("a minimum amount from Settings is enforced", r["min_enforced"] is True),
    ("small order paid online, no advance", r["small_online_ok"] is True and float(r["small_online_adv"]) == 0),
    ("advance order saved as advance_cod", r["adv_method"] == "advance_cod"),
    ("advance = 50% rounded up", float(r["adv_required"]) == float(r["adv_expected"])),
    ("webhook records the advance", r["webhook_result"] == "advance_paid"),
    ("advance_amount set", float(r["after_adv_amount"]) == float(r["adv_required"])),
    ("order confirmed after advance", r["after_status"] == "confirmed"),
    ("payment still pending (balance on delivery)", r["after_pay_status"] == "pending"),
    ("payment_request = advance", r["after_request"] == "advance"),
    ("PI asks only the balance after advance", float(r["pi_pay_now_after"]) == float(r["pi_balance_expected"])),
    ("customer can switch to advance", r["switch_status"] == "advance" and r["switch_method"] == "advance_cod" and r["switch_adv_ok"]),
    ("PI asks the advance before it is paid", r["pi_pay_now_before"] is True),
    ("switch to COD refused", r["switch_cod_refused"] is True),
    ("old pending COD orders all have an ask", r["old_cod_open"] == r["old_cod_with_ask"]),
    ("old ask = 50%", r["old_ask_rule_ok"] is True),
    ("settings: COD off, 50%, no minimum", r["settings"].get("cod_enabled") is False and r["settings"].get("advance_percent") == 50
     and r["settings"].get("full_online_below") == 0),
]
for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
print(json.dumps(r))
left = sa.run_sql("select count(*) n from orders where customer_mobile = '9999900001'")[0]["n"]
print("PASS test orders rolled back" if left == 0 else "FAIL test orders left behind")
sys.exit(0 if all(ok for _, ok in checks) and left == 0 else 1)
