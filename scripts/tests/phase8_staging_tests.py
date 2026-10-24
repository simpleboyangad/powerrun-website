#!/usr/bin/env python
"""
PowerRun Industries - Phase 8 tests (report functions). STAGING ONLY.

    POWERRUN_PROJECT_REF=<staging ref> python scripts/tests/phase8_staging_tests.py

Needs migrations 37-40 on staging and the Phase 4 test agents.
"""
import datetime
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
os.environ["POWERRUN_PROJECT_REF"] = sa.PROJECT_REF
import agent_client as ac  # noqa: E402

BASE = "https://%s.supabase.co" % sa.PROJECT_REF
ANON = next(k["api_key"] for k in sa.api_request("/projects/%s/api-keys" % sa.PROJECT_REF) if k.get("name") == "anon")
OWNER_UID = sa.run_sql("select user_id from admin_users where role = 'owner' and is_active limit 1")[0]["user_id"]
TODAY = datetime.date.today().isoformat()
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), str(detail)))


def as_owner(q):
    claims = json.dumps({"sub": OWNER_UID, "role": "authenticated"})
    return sa.run_sql("begin; select set_config('request.jwt.claims', '%s', true); set local role authenticated; %s; commit;" % (claims, q))


def post(fn, body, key, token=None):
    req = urllib.request.Request(BASE + "/rest/v1/rpc/" + fn, method="POST", data=json.dumps(body).encode(),
                                 headers={"apikey": key, "Authorization": "Bearer " + (token or key), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, None


rng = "'%s', '%s'" % (TODAY, TODAY)
before = as_owner("select public.report_sales(%s) r" % rng)[0]["r"]

# a real order today raises the figures; marking it test removes it again
pid = sa.run_sql("select id from products where sku = 'TEST-CN'")[0]["id"]
code, o = post("create_website_order", {"p_customer": {"name": "Test Report", "mobile": "9%09d" % (uuid.uuid4().int % 10 ** 9),
               "address": "1 Test Street", "city": "Agra", "state": "Uttar Pradesh", "pincode": "282001"},
               "p_items": [{"product_id": pid, "quantity": 1}], "p_payment_method": "cod", "p_coupon_code": None}, ANON)
after = as_owner("select public.report_sales(%s) r" % rng)[0]["r"]
check("S1 a new order shows in today's sales", after["orders"]["count"] == before["orders"]["count"] + 1
      and float(after["net_sales"]) == float(before["net_sales"]) + float(o["total_amount"]), "%s -> %s" % (before["orders"]["count"], after["orders"]["count"]))
as_owner("update orders set is_test = true where id = '%s'" % o["order_id"])
again = as_owner("select public.report_sales(%s) r" % rng)[0]["r"]
check("S2 a test order is left out", again["orders"]["count"] == before["orders"]["count"])

for fn, args in [("report_receivables", ""), ("report_dispatch", ""), ("report_leads", rng), ("report_stock", rng),
                 ("report_margin", rng), ("report_health", "")]:
    try:
        r = as_owner("select public.%s(%s) r" % (fn, args))[0]["r"]
        check("O %s runs for the owner" % fn, isinstance(r, dict), list(r)[:4])
    except SystemExit as e:
        check("O %s runs for the owner" % fn, False, str(e)[-150:])

key, tok = ac.sign_in("sales")
code, r = post("report_sales", {"p_from": TODAY, "p_to": TODAY}, key, tok)
check("A1 an agent can read sales", code == 200 and "net_sales" in r, code)
code, _ = post("report_margin", {"p_from": TODAY, "p_to": TODAY}, key, tok)
check("A2 an agent cannot read margins (cost data)", code == 403, code)
code, _ = post("report_health", {}, ANON)
check("A3 anon cannot read reports", code in (401, 403), code)

for name, ok, detail in results:
    print("%s  %s  %s" % ("PASS" if ok else "FAIL", name, detail[:160]))
print("%d/%d passed" % (sum(1 for r in results if r[1]), len(results)))
