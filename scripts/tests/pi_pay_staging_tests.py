#!/usr/bin/env python
"""
PowerRun Industries - migration 49 (pay a PI online) tests. STAGING ONLY.

    POWERRUN_PROJECT_REF=<staging ref> python scripts/tests/pi_pay_staging_tests.py

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
  big uuid := (select id from products where is_active and price > 3000
                and availability not in ('out_of_stock', 'discontinued') and (availability <> 'in_stock' or stock >= 1)
                order by price limit 1);
  cust jsonb := '{"name":"Test PI Pay","mobile":"9999900002","address":"Test street","city":"Kasganj","state":"Uttar Pradesh","pincode":"207124"}';
  r jsonb := '{}';
  o jsonb;
  oid uuid;
  ord orders%rowtype;
  res text;
begin
  if big is null then raise exception 'no big product on staging'; end if;

  -- 1. an old COD order (made the way pre-48 orders look) pays the 50% advance from its PI
  o := public.create_website_order(cust, jsonb_build_array(jsonb_build_object('product_id', big, 'quantity', 1)), 'razorpay', null);
  oid := (o ->> 'order_id')::uuid;
  update orders set payment_method = 'cod', advance_required = ceil(total_amount / 2), payment_request = 'pi_sent' where id = oid;
  select * into ord from orders where id = oid;
  o := public.pi_start_online_payment(ord.pi_token, false);
  select * into ord from orders where id = oid;
  r := r || jsonb_build_object('adv_status', o ->> 'status', 'adv_id_ok', (o ->> 'order_id')::uuid = oid,
                               'adv_method', ord.payment_method, 'adv_amount', (o ->> 'amount')::numeric,
                               'adv_expected', ceil(ord.total_amount / 2), 'adv_required', ord.advance_required);

  -- 2. the webhook then records it as an advance
  update orders set razorpay_order_id = 'order_TEST49' where id = oid;
  res := public.pr_record_razorpay_payment('evt_test49_a', 'payment.captured', 'order_TEST49', 'pay_TEST49',
                                           round(ord.advance_required * 100)::bigint, 'INR');
  select * into ord from orders where id = oid;
  r := r || jsonb_build_object('webhook', res, 'after_adv', ord.advance_amount, 'after_status', ord.order_status,
                               'after_pay', ord.payment_status);

  -- 3. once an advance is in, the PI can not start another online payment
  begin
    perform public.pi_start_online_payment(ord.pi_token, false);
    r := r || '{"second_refused": false}';
  exception when others then r := r || jsonb_build_object('second_refused', sqlerrm like '%already received%');
  end;

  -- 4. full payment from the PI of an advance order switches it back to a full online order
  o := public.create_website_order(cust, jsonb_build_array(jsonb_build_object('product_id', big, 'quantity', 1)), 'advance_cod', null);
  oid := (o ->> 'order_id')::uuid;
  select * into ord from orders where id = oid;
  o := public.pi_start_online_payment(ord.pi_token, true);
  select * into ord from orders where id = oid;
  r := r || jsonb_build_object('full_method', ord.payment_method, 'full_amount_ok', (o ->> 'amount')::numeric = ord.total_amount);

  -- 5. a full-online (razorpay) order with no ask yet gets 50% computed
  o := public.create_website_order(cust, jsonb_build_array(jsonb_build_object('product_id', big, 'quantity', 1)), 'razorpay', null);
  oid := (o ->> 'order_id')::uuid;
  select * into ord from orders where id = oid;
  o := public.pi_start_online_payment(ord.pi_token, false);
  select * into ord from orders where id = oid;
  r := r || jsonb_build_object('rzp_adv_ok', ord.payment_method = 'advance_cod' and ord.advance_required = ceil(ord.total_amount / 2));

  -- 6. cancelled order and a bad token are refused
  update orders set order_status = 'cancelled' where id = oid;
  begin
    perform public.pi_start_online_payment(ord.pi_token, true);
    r := r || '{"cancel_refused": false}';
  exception when others then r := r || jsonb_build_object('cancel_refused', sqlerrm like '%can not be paid%');
  end;
  begin
    perform public.pi_start_online_payment(gen_random_uuid(), true);
    r := r || '{"bad_token_refused": false}';
  exception when others then r := r || jsonb_build_object('bad_token_refused', sqlerrm like '%not valid%');
  end;

  -- 7. anon may call it (the PI page is public), nothing else is granted
  r := r || jsonb_build_object('anon_exec', has_function_privilege('anon', 'public.pi_start_online_payment(uuid, boolean)', 'execute'));

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
    ("old COD order: PI starts the advance", r["adv_status"] == "ready" and r["adv_id_ok"] is True),
    ("switched to advance_cod", r["adv_method"] == "advance_cod"),
    ("asks 50% rounded up", float(r["adv_amount"]) == float(r["adv_expected"]) == float(r["adv_required"])),
    ("webhook records the advance", r["webhook"] == "advance_paid" and float(r["after_adv"]) == float(r["adv_required"])),
    ("order confirmed, balance on delivery", r["after_status"] == "confirmed" and r["after_pay"] == "pending"),
    ("no second online payment after the advance", r["second_refused"] is True),
    ("full payment switches to razorpay for the total", r["full_method"] == "razorpay" and r["full_amount_ok"] is True),
    ("online order with no ask gets 50%", r["rzp_adv_ok"] is True),
    ("cancelled order refused", r["cancel_refused"] is True),
    ("bad token refused", r["bad_token_refused"] is True),
    ("anon can call it", r["anon_exec"] is True),
]
for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
print(json.dumps(r))
left = sa.run_sql("select count(*) n from orders where customer_mobile = '9999900002'")[0]["n"]
print("PASS test orders rolled back" if left == 0 else "FAIL test orders left behind")
sys.exit(0 if all(ok for _, ok in checks) and left == 0 else 1)
