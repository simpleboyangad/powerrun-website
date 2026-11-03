#!/usr/bin/env python
"""
PowerRun Industries - migration 50 (Shiprocket shipping) tests. STAGING ONLY.

    POWERRUN_PROJECT_REF=<staging ref> python scripts/tests/shiprocket_staging_tests.py

Checks pr_record_courier_event() (the courier webhook's database side) and the
lock-down of the new tables. Everything runs in one transaction that is rolled back.
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
  cust jsonb := '{"name":"Test Ship","mobile":"9999900003","address":"Test street","city":"Kasganj","state":"Uttar Pradesh","pincode":"207124"}';
  r jsonb := '{}';
  o jsonb;
  a uuid; b uuid; c uuid; d uuid;
  ord orders%rowtype;
  res text;
begin
  if big is null then raise exception 'no product on staging'; end if;

  -- an advance order that the courier picks up and delivers
  o := public.create_website_order(cust, jsonb_build_array(jsonb_build_object('product_id', big, 'quantity', 1)), 'advance_cod', null);
  a := (o ->> 'order_id')::uuid;
  update orders set advance_amount = advance_required, order_status = 'packed', awb_code = 'TESTAWB1',
         courier_partner = 'Test Courier', tracking_number = 'TESTAWB1' where id = a;

  res := public.pr_record_courier_event('k1', 'TESTAWB1', null, 'PICKED UP', now(), '{}');
  select * into ord from orders where id = a;
  r := r || jsonb_build_object('picked', res, 'picked_status', ord.order_status, 'ship_status', ord.ship_status);

  r := r || jsonb_build_object('dup', public.pr_record_courier_event('k1', 'TESTAWB1', null, 'PICKED UP', now(), '{}'));

  res := public.pr_record_courier_event('k2', 'TESTAWB1', null, 'OUT FOR DELIVERY', now(), '{}');
  r := r || jsonb_build_object('ofd_timeline', exists (select 1 from delivery_timeline where order_id = a and description = 'Out for delivery'));

  res := public.pr_record_courier_event('k3', 'TESTAWB1', null, 'DELIVERED', now(), '{}');
  select * into ord from orders where id = a;
  r := r || jsonb_build_object('delivered', res, 'del_status', ord.order_status, 'del_pay', ord.payment_status,
                               'del_at', ord.delivered_at is not null);

  -- RTO on another order: flag + note, status unchanged
  o := public.create_website_order(cust, jsonb_build_array(jsonb_build_object('product_id', big, 'quantity', 1)), 'advance_cod', null);
  b := (o ->> 'order_id')::uuid;
  update orders set advance_amount = advance_required, order_status = 'shipped', awb_code = 'TESTAWB2', courier_partner = 'X' where id = b;
  res := public.pr_record_courier_event('k4', 'TESTAWB2', null, 'RTO INITIATED', now(), '{}');
  select * into ord from orders where id = b;
  r := r || jsonb_build_object('rto', res, 'rto_flag', ord.rto, 'rto_status', ord.order_status);

  -- cancelled before pickup: shipment fields cleared, back to confirmed
  o := public.create_website_order(cust, jsonb_build_array(jsonb_build_object('product_id', big, 'quantity', 1)), 'advance_cod', null);
  c := (o ->> 'order_id')::uuid;
  update orders set advance_amount = advance_required, order_status = 'packed', awb_code = 'TESTAWB3', sr_order_id = 1,
         sr_shipment_id = 2, label_url = 'https://x', courier_partner = 'X', tracking_number = 'TESTAWB3' where id = c;
  res := public.pr_record_courier_event('k5', 'TESTAWB3', null, 'CANCELED', now(), '{}');
  select * into ord from orders where id = c;
  r := r || jsonb_build_object('cancel', res, 'cancel_cleared', ord.awb_code is null and ord.label_url is null and ord.tracking_number is null,
                               'cancel_status', ord.order_status);

  r := r || jsonb_build_object('unknown', public.pr_record_courier_event('k6', 'NOPE', null, 'DELIVERED', now(), '{}'));

  -- migration 51: booked in the Shiprocket app, only the tracking number typed in Admin
  o := public.create_website_order(cust, jsonb_build_array(jsonb_build_object('product_id', big, 'quantity', 1)), 'advance_cod', null);
  d := (o ->> 'order_id')::uuid;
  update orders set advance_amount = advance_required, order_status = 'shipped', courier_partner = 'Y', tracking_number = 'testawb4 ' where id = d;
  res := public.pr_record_courier_event('k7', 'TESTAWB4', null, 'DELIVERED', now(), '{}');
  select * into ord from orders where id = d;
  r := r || jsonb_build_object('by_tracking', res, 'by_tracking_status', ord.order_status, 'by_tracking_awb', ord.awb_code);

  r := r || jsonb_build_object(
    'anon_exec', has_function_privilege('anon', 'public.pr_record_courier_event(text, text, text, text, timestamptz, jsonb)', 'execute'),
    'auth_exec', has_function_privilege('authenticated', 'public.pr_record_courier_event(text, text, text, text, timestamptz, jsonb)', 'execute'),
    'tokens_auth_read', has_table_privilege('authenticated', 'public.shiprocket_tokens', 'select'),
    'tokens_anon_read', has_table_privilege('anon', 'public.shiprocket_tokens', 'select'),
    'events_anon_read', has_table_privilege('anon', 'public.courier_events', 'select'),
    'surface_flagged', (select count(*) from products where ship_surface_only));

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
    ("picked up -> shipped", r["picked"] == "shipped" and r["picked_status"] == "shipped" and r["ship_status"] == "PICKED UP"),
    ("same event applied once", r["dup"] == "duplicate"),
    ("out for delivery on the timeline", r["ofd_timeline"] is True),
    ("delivered -> delivered + paid", r["delivered"] == "delivered" and r["del_status"] == "delivered"
     and r["del_pay"] == "paid" and r["del_at"] is True),
    ("RTO flagged, status kept", r["rto"] == "rto" and r["rto_flag"] is True and r["rto_status"] == "shipped"),
    ("cancel clears the shipment", r["cancel"] == "cancelled" and r["cancel_cleared"] is True and r["cancel_status"] == "confirmed"),
    ("unknown AWB logged only", r["unknown"] == "no_order"),
    ("matched by the typed tracking number", r["by_tracking"] == "delivered" and r["by_tracking_status"] == "delivered"
     and r["by_tracking_awb"] == "testawb4"),
    ("webhook RPC not callable by anon / users", r["anon_exec"] is False and r["auth_exec"] is False),
    ("token cache locked", r["tokens_auth_read"] is False and r["tokens_anon_read"] is False),
    ("courier events not public", r["events_anon_read"] is False),
]
for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
print(json.dumps(r))
left = sa.run_sql("select count(*) n from orders where customer_mobile = '9999900003'")[0]["n"]
print("PASS test orders rolled back" if left == 0 else "FAIL test orders left behind")
sys.exit(0 if all(ok for _, ok in checks) and left == 0 else 1)
