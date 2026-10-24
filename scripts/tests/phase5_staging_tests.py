#!/usr/bin/env python
"""
PowerRun Industries - Phase 5 tests (order lifecycle, serial numbers, warranty on delivery). STAGING ONLY.

    POWERRUN_PROJECT_REF=<staging ref> python scripts/tests/phase5_staging_tests.py

Needs migrations 37 and 38 on staging and the Phase 4 test agents. The owner is simulated in SQL
(request.jwt.claims) with the staging owner's user id. Synthetic data only.
"""
import json
import os
import sys
import urllib.error
import urllib.request
import uuid

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import supabase_admin as sa  # noqa: E402

if sa.PROJECT_REF == "nnkopxkyxcmtiunftlgr":
    sys.exit("Refusing to run against production.")

BASE = "https://%s.supabase.co" % sa.PROJECT_REF
ANON = next(k["api_key"] for k in sa.api_request("/projects/%s/api-keys" % sa.PROJECT_REF) if k.get("name") == "anon")
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), str(detail)))


def sql(q):
    return sa.run_sql(q)


OWNER_UID = sql("select user_id from admin_users where role = 'owner' and is_active limit 1")[0]["user_id"]


def as_owner(q):
    claims = json.dumps({"sub": OWNER_UID, "role": "authenticated"})
    return sql("begin; select set_config('request.jwt.claims', '%s', true); set local role authenticated; %s; commit;"
               % (claims, q))


def owner_try(q):
    """Run as the owner; return (ok, message)."""
    try:
        return True, as_owner(q)
    except SystemExit as e:  # supabase_admin exits on SQL errors
        return False, str(e)


def rpc_anon(fn, body):
    req = urllib.request.Request(BASE + "/rest/v1/rpc/" + fn, data=json.dumps(body).encode(), method="POST",
                                 headers={"apikey": ANON, "Authorization": "Bearer " + ANON, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


sql("""insert into categories (name, slug, is_active) values ('Test Batteries', 'test-batteries', true) on conflict (slug) do nothing;
insert into products (name, slug, sku, price, mrp, stock, availability, gst_rate, price_includes_gst, hsn_code, is_active, category_id, warranty)
select v.name, v.slug, v.sku, 10000, 10000, 50, 'in_stock', 18, true, '8507', true, (select id from categories where slug = 'test-batteries'), v.w
from (values ('Test Warranty Battery', 'test-warranty-battery', 'TEST-WAR', '5 Years Warranty'),
             ('Test Resale Part', 'test-resale-part', 'TEST-NOWAR', 'No warranty - damaged, defective or wrong items replaced within 7 days of delivery')) v(name, slug, sku, w)
where not exists (select 1 from products p where p.sku = v.sku);
update products set stock = 50, availability = 'in_stock' where sku in ('TEST-WAR', 'TEST-NOWAR');""")
PW = sql("select id from products where sku = 'TEST-WAR'")[0]["id"]
PN = sql("select id from products where sku = 'TEST-NOWAR'")[0]["id"]

mobile = "9%09d" % (uuid.uuid4().int % 10 ** 9)
code, o = rpc_anon("create_website_order", {"p_customer": {"name": "Test Lifecycle", "mobile": mobile, "address": "1 Test Street",
                   "city": "Agra", "state": "Uttar Pradesh", "pincode": "282001"},
                   "p_items": [{"product_id": PW, "quantity": 2}, {"product_id": PN, "quantity": 1}],
                   "p_payment_method": "cod", "p_coupon_code": None})
OID = o["order_id"]
items = {r["product_id"]: r["id"] for r in sql("select id, product_id from order_items where order_id = '%s'" % OID)}

check("N1 serial rule: warranty product needs serial, no-warranty part does not",
      sql("select public.pr_needs_serial('%s') a, public.pr_needs_serial('%s') b" % (PW, PN))[0] == {"a": True, "b": False})

ok, _ = owner_try("update orders set order_status = 'confirmed' where id = '%s'" % OID)
row = sql("select confirmed_at is not null c from orders where id = '%s'" % OID)[0]
check("L1 confirm stamps confirmed_at", ok and row["c"])

ok, msg = owner_try("update orders set order_status = 'packed' where id = '%s'" % OID)
check("L2 packing without serials is refused", not ok and "Serial numbers missing" in msg and "(0/2)" in msg, msg[-160:])

s1, s2 = "TST" + uuid.uuid4().hex[:8].upper(), "TST" + uuid.uuid4().hex[:8].upper()
ok, res = owner_try("select public.admin_save_order_serials('%s', '%s'::jsonb) n" % (OID, json.dumps(
    [{"order_item_id": items[PW], "serial_number": s1.lower()}, {"order_item_id": items[PW], "serial_number": s2}])))
saved = sql("select serial_number from order_serials where order_id = '%s' order by serial_number" % OID)
check("S1 owner saves 2 serials (stored upper-case)", ok and res[0]["n"] == 2 and sorted([s1, s2]) == [r["serial_number"] for r in saved], res)

ok, msg = owner_try("select public.admin_save_order_serials('%s', '%s'::jsonb) n" % (OID, json.dumps(
    [{"order_item_id": items[PW], "serial_number": s1}] * 3)))
check("S2 more serials than units is refused", not ok, msg[-120:])
check("S2 the earlier serials are untouched", len(sql("select 1 from order_serials where order_id = '%s'" % OID)) == 2)

# a second order cannot reuse a serial of the same product
code, o2 = rpc_anon("create_website_order", {"p_customer": {"name": "Test Dup", "mobile": "8%09d" % (uuid.uuid4().int % 10 ** 9),
                    "address": "2 Test Street", "city": "Agra", "state": "Uttar Pradesh", "pincode": "282001"},
                    "p_items": [{"product_id": PW, "quantity": 1}], "p_payment_method": "cod", "p_coupon_code": None})
i2 = sql("select id from order_items where order_id = '%s'" % o2["order_id"])[0]["id"]
ok, msg = owner_try("select public.admin_save_order_serials('%s', '%s'::jsonb) n" % (o2["order_id"], json.dumps(
    [{"order_item_id": i2, "serial_number": s1}])))
check("S3 the same serial on another order is refused", not ok and "already used" in msg, msg[-120:])

ok, msg = owner_try("update orders set order_status = 'packed' where id = '%s'" % OID)
check("L3 with all serials the order can be packed", ok and sql("select packed_at is not null p from orders where id='%s'" % OID)[0]["p"], msg if not ok else "")

ok, msg = owner_try("update orders set order_status = 'shipped' where id = '%s'" % OID)
check("L4 shipping without a courier is refused", not ok and "courier" in msg, msg[-120:])
ok, msg = owner_try("update orders set order_status = 'shipped', courier_partner = 'Delhivery', tracking_number = 'AWB123' where id = '%s'" % OID)
r = sql("select shipped_at is not null s, delivery_status from orders where id='%s'" % OID)[0]
check("L5 shipped with courier stamps shipped_at", ok and r["s"] and r["delivery_status"] == "shipped", msg if not ok else r)

ok, msg = owner_try("update orders set order_status = 'delivered' where id = '%s'" % OID)
r = sql("select delivered_at is not null d, actual_delivery_date is not null a from orders where id='%s'" % OID)[0]
check("L6 delivered stamps delivered_at and the delivery date", ok and r["d"] and r["a"], msg if not ok else r)
w = sql("""select w.warranty_number, w.status, w.warranty_start_date, w.warranty_end_date, w.order_id, w.mobile
           from order_serials s join warranties w on w.id = s.warranty_id where s.order_id = '%s'""" % OID)
check("W1 delivery registers one approved warranty per serial", len(w) == 2 and all(x["status"] == "approved" and x["order_id"] == OID for x in w), w)
check("W2 warranty runs 5 years from delivery",
      sql("""select bool_and(w.warranty_end_date = w.warranty_start_date + interval '60 months') ok
             from order_serials s join warranties w on w.id = s.warranty_id where s.order_id = '%s'""" % OID)[0]["ok"])

code, res = rpc_anon("submit_warranty_registration", {"p_data": {"name": "Test Lifecycle", "mobile": mobile,
                     "serial_number": s1.lower(), "product_id": PW}})
check("W3 customer registering the same serial gets the existing warranty", code == 200 and res.get("already_registered")
      and sql("select count(*) n from warranties where upper(serial_number) = '%s'" % s1)[0]["n"] == 1, res)

ok, msg = owner_try("update orders set order_status = 'shipped' where id = '%s'" % OID)
check("L7 a delivered order cannot go back", not ok and "Delivered order" in msg, msg[-120:])
ok, msg = owner_try("select public.admin_save_order_serials('%s', '[]'::jsonb)" % OID)
check("S4 serials of a delivered order are locked", not ok, msg[-120:])

tl = [x["status"] for x in sql("select status from delivery_timeline where order_id = '%s' order by status_date" % OID)]
check("T1 timeline has every step", tl == ["confirmed", "packed", "shipped", "delivered"], tl)
code, pub = rpc_anon("get_order_public", {"p_order_number": o["order_number"], "p_mobile": mobile})
check("T2 Track Order shows the times and the timeline", code == 200 and pub.get("delivered_at") and len(pub.get("timeline", [])) == 4,
      {k: pub.get(k) for k in ("shipped_at", "delivered_at")})

# a part without warranty ships without serials; cancelled cannot reopen; webhook-style restore still works
ok, msg = owner_try("update orders set order_status = 'cancelled', cancelled_reason = 'test' where id = '%s'" % o2["order_id"])
ok2, msg2 = owner_try("update orders set order_status = 'confirmed' where id = '%s'" % o2["order_id"])
check("L8 owner cannot reopen a cancelled order", ok and not ok2 and "can not be reopened" in msg2, msg2[-120:])
sql("update orders set order_status = 'confirmed' where id = '%s'" % o2["order_id"])   # service role, like the webhook
r = sql("select order_status, cancelled_at from orders where id='%s'" % o2["order_id"])[0]
check("L9 the payment webhook can still restore a cancelled order", r["order_status"] == "confirmed" and r["cancelled_at"] is None, r)

code, o3 = rpc_anon("create_website_order", {"p_customer": {"name": "Test Part", "mobile": "7%09d" % (uuid.uuid4().int % 10 ** 9),
                    "address": "3 Test Street", "city": "Agra", "state": "Uttar Pradesh", "pincode": "282001"},
                    "p_items": [{"product_id": PN, "quantity": 1}], "p_payment_method": "cod", "p_coupon_code": None})
ok, msg = owner_try("update orders set order_status = 'packed' where id = '%s'" % o3["order_id"])
check("L10 a no-warranty part packs without serials", ok, msg[-120:] if not ok else "")

code, rows = 0, None
try:
    sys.path.insert(0, os.path.join(HERE))
    os.environ["POWERRUN_PROJECT_REF"] = sa.PROJECT_REF
    import agent_client as ac  # noqa: E402
    key, tok = ac.sign_in("support")
    rows = ac.call("GET", "/rest/v1/order_serials?select=serial_number&order_id=eq." + OID, key, tok)
    check("A1 support agent can read serials", rows and len(rows) == 2, rows)
    req = urllib.request.Request(BASE + "/rest/v1/rpc/admin_save_order_serials", method="POST",
                                 data=json.dumps({"p_order_id": OID, "p_serials": []}).encode(),
                                 headers={"apikey": key, "Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=60)
        check("A2 agent cannot change serials", False, "accepted")
    except urllib.error.HTTPError as e:
        check("A2 agent cannot change serials", e.code == 403, "HTTP %s" % e.code)
except SystemExit as e:
    check("A1 support agent can read serials", False, str(e))

code, body = 0, None
req = urllib.request.Request(BASE + "/rest/v1/order_serials?select=id&limit=1", headers={"apikey": ANON, "Authorization": "Bearer " + ANON})
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        check("S5 anon cannot read serials", json.loads(r.read().decode()) == [])
except urllib.error.HTTPError as e:
    check("S5 anon cannot read serials", True, "HTTP %s" % e.code)

for name, ok, detail in results:
    print("%s  %s  %s" % ("PASS" if ok else "FAIL", name, detail[:160]))
print("%d/%d passed" % (sum(1 for r in results if r[1]), len(results)))
