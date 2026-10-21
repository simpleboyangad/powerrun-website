#!/usr/bin/env python
"""
PowerRun Industries - Phase 3 tests (payments + stock). STAGING ONLY.

    POWERRUN_PROJECT_REF=<staging ref> python scripts/tests/phase3_staging_tests.py

Needs migration 36 on staging, the razorpay-webhook function deployed there, and the staging webhook
secret in %USERPROFILE%\\.powerrun\\staging-webhook-secret.txt. Synthetic data only.
"""
import hashlib
import hmac
import json
import os
import sys
import threading
import urllib.error
import urllib.request
import uuid

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import supabase_admin as sa  # noqa: E402

if sa.PROJECT_REF == "nnkopxkyxcmtiunftlgr":
    sys.exit("Refusing to run against production.")

BASE = "https://%s.supabase.co" % sa.PROJECT_REF
SECRET = open(os.path.join(os.path.expanduser("~"), ".powerrun", "staging-webhook-secret.txt")).read().strip()
ANON = next(k["api_key"] for k in sa.api_request("/projects/%s/api-keys" % sa.PROJECT_REF) if k.get("name") == "anon")
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))


def sql(q):
    return sa.run_sql(q)


def webhook(body, secret=SECRET, event_id=None):
    raw = json.dumps(body).encode()
    sig = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    req = urllib.request.Request(BASE + "/functions/v1/razorpay-webhook", data=raw, method="POST", headers={
        "Content-Type": "application/json", "X-Razorpay-Signature": sig,
        "X-Razorpay-Event-Id": event_id or ("evt_" + uuid.uuid4().hex)})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def captured(rzp_order, amount_paise, payment_id=None):
    return {"event": "payment.captured", "created_at": 1, "payload": {"payment": {"entity": {
        "id": payment_id or ("pay_" + uuid.uuid4().hex[:14]), "order_id": rzp_order,
        "amount": amount_paise, "currency": "INR", "status": "captured"}}}}


def anon_order(sku, qty=1):
    pid = sql("select id from products where sku = '%s'" % sku)[0]["id"]
    body = json.dumps({"p_customer": {"name": "Test Buyer", "mobile": "9%09d" % (uuid.uuid4().int % 10 ** 9),
                                      "address": "1 Test Street", "city": "Agra", "state": "Uttar Pradesh",
                                      "pincode": "282001"},
                       "p_items": [{"product_id": pid, "quantity": qty}],
                       "p_payment_method": "razorpay", "p_coupon_code": None}).encode()
    req = urllib.request.Request(BASE + "/rest/v1/rpc/create_website_order", data=body, method="POST",
                                 headers={"apikey": ANON, "Authorization": "Bearer " + ANON,
                                          "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": json.loads(e.read().decode() or "{}").get("message")}


def make_rzp_order(sku):
    o = anon_order(sku)
    rzp = "order_TEST" + uuid.uuid4().hex[:10]
    sql("update orders set razorpay_order_id = '%s' where id = '%s'" % (rzp, o["order_id"]))
    return o, rzp


def stock(sku):
    return sql("select stock from products where sku = '%s'" % sku)[0]["stock"]


# synthetic products
sql("""insert into categories (name, slug, is_active) values ('Test Batteries', 'test-batteries', true) on conflict (slug) do nothing;
insert into products (name, slug, sku, price, mrp, stock, availability, gst_rate, price_includes_gst, hsn_code, is_active, category_id)
select v.name, v.slug, v.sku, 10000, 10000, 20, 'in_stock', 18, true, '8507', true, (select id from categories where slug = 'test-batteries')
from (values ('Test Webhook Battery','test-webhook-battery','TEST-WH'), ('Test Last Unit','test-last-unit','TEST-LAST')) v(name, slug, sku)
where not exists (select 1 from products p where p.sku = v.sku);
update products set stock = 20, availability = 'in_stock' where sku = 'TEST-WH';
update products set stock = 1, availability = 'in_stock' where sku = 'TEST-LAST';""")

# W1 bad signature
o, rzp = make_rzp_order("TEST-WH")
code, _ = webhook(captured(rzp, int(round(float(o["total_amount"]) * 100))), secret="wrong-secret")
check("W1 webhook with a wrong signature is refused", code == 401, "HTTP %s" % code)
check("W1 order still unpaid", sql("select payment_status from orders where id='%s'" % o["order_id"])[0]["payment_status"] != "paid")

# W2 valid payment
amount = int(round(float(o["total_amount"]) * 100))
code, body = webhook(captured(rzp, amount), event_id="evt_fixed_" + rzp)
row = sql("select payment_status, order_status, razorpay_payment_id is not null as pid from orders where id='%s'" % o["order_id"])[0]
check("W2 signed payment.captured marks the order paid", code == 200 and body.get("result") == "paid"
      and row["payment_status"] == "paid" and row["order_status"] == "confirmed" and row["pid"], json.dumps(body))

# W3 replay
code, body = webhook(captured(rzp, amount), event_id="evt_fixed_" + rzp)
check("W3 the same event again is ignored", body.get("result") == "duplicate", json.dumps(body))

# W4 amount mismatch
o2, rzp2 = make_rzp_order("TEST-WH")
code, body = webhook(captured(rzp2, 100))
st = sql("select payment_status from orders where id='%s'" % o2["order_id"])[0]["payment_status"]
check("W4 wrong amount is not marked paid", body.get("result") == "amount_mismatch" and st != "paid", json.dumps(body))

# W5 unknown order
code, body = webhook(captured("order_DOESNOTEXIST", 100))
check("W5 unknown Razorpay order is logged only", code == 200 and body.get("result") == "unknown_order", json.dumps(body))

# E1 admin cancels an unpaid online order by hand -> stock returns (no automatic cancellation)
before = stock("TEST-WH")
o3, rzp3 = make_rzp_order("TEST-WH")
after_order = stock("TEST-WH")
sql("update orders set order_status = 'cancelled', cancelled_reason = 'Test: cancelled by admin' where id = '%s'" % o3["order_id"])
check("E1 cancelling an unpaid order returns its stock", stock("TEST-WH") == before and after_order == before - 1,
      "before %s, after order %s, now %s" % (before, after_order, stock("TEST-WH")))
check("E1 no automatic expiry job exists",
      sql("select count(*) as n from pg_proc where proname = 'pr_expire_unpaid_online_orders'")[0]["n"] == 0)

# E2 paid after the order was cancelled
s_before = stock("TEST-WH")
code, body = webhook(captured(rzp3, int(round(float(o3["total_amount"]) * 100))))
r3 = sql("select payment_status, order_status from orders where id='%s'" % o3["order_id"])[0]
check("E2 payment after cancellation restores the order and stock",
      body.get("result") == "paid_after_cancel_restored" and r3["order_status"] == "confirmed"
      and r3["payment_status"] == "paid" and stock("TEST-WH") == s_before - 1, json.dumps(body))

# C1 two buyers, last unit, same moment
sql("update products set stock = 1, availability = 'in_stock' where sku = 'TEST-LAST'")
out = []
threads = [threading.Thread(target=lambda: out.append(anon_order("TEST-LAST"))) for _ in range(2)]
[t.start() for t in threads]
[t.join() for t in threads]
ok = sum(1 for r in out if r.get("order_id"))
check("C1 two orders for the last unit at once: exactly one succeeds", ok == 1 and stock("TEST-LAST") == 0,
      "; ".join(r.get("order_number") or r.get("error", "?") for r in out))

# L1 ledger
led = sql("""select reason from stock_ledger l join products p on p.id = l.product_id
             where p.sku in ('TEST-WH','TEST-LAST') order by l.id""")
reasons = [r["reason"] for r in led]
check("L1 stock ledger records orders, cancellations and re-reservations",
      any(x.startswith("order ") for x in reasons) and any(x.startswith("cancelled ") for x in reasons)
      and any(x.startswith("paid after cancel") for x in reasons), ", ".join(sorted(set(r.split(" PR")[0] for r in reasons))))

# anon cannot see the new tables
req = urllib.request.Request(BASE + "/rest/v1/stock_ledger?select=id&limit=1", headers={"apikey": ANON, "Authorization": "Bearer " + ANON})
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        rows = json.loads(r.read().decode())
        check("S anon cannot read stock_ledger", rows == [], "%d rows" % len(rows))
except urllib.error.HTTPError as e:
    check("S anon cannot read stock_ledger", True, "HTTP %s" % e.code)

for name, ok, detail in results:
    print("%s  %s  %s" % ("PASS" if ok else "FAIL", name, detail[:140]))
print("%d/%d passed" % (sum(1 for r in results if r[1]), len(results)))
