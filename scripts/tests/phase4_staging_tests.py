#!/usr/bin/env python
"""
PowerRun Industries - Phase 4 tests (agent roles, Approval Center, 4 % discount rule). STAGING ONLY.

    POWERRUN_PROJECT_REF=<staging ref> python scripts/tests/phase4_staging_tests.py

Needs migration 37 on staging. Creates (or reuses) the staging agent logins agent-sales@powerrun.test and
agent-support@powerrun.test; their generated passwords live in %USERPROFILE%\\.powerrun\\staging-agents.json.
Agents are tested through the real REST API with their own login; the owner is simulated in SQL
(request.jwt.claims) with the staging owner's user id. Synthetic data only.
"""
import json
import os
import secrets
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
KEYS = {k.get("name"): k["api_key"] for k in sa.api_request("/projects/%s/api-keys" % sa.PROJECT_REF)}
ANON, SERVICE = KEYS["anon"], KEYS["service_role"]
CREDS_FILE = os.path.join(os.path.expanduser("~"), ".powerrun", "staging-agents.json")
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), str(detail)))


def sql(q):
    return sa.run_sql(q)


def http(method, path, body=None, token=None, key=ANON, prefer=None):
    headers = {"apikey": key, "Authorization": "Bearer " + (token or key), "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(BASE + path, method=method, headers=headers,
                                 data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw


def as_owner(q):
    claims = json.dumps({"sub": OWNER_UID, "role": "authenticated"})
    return sql("begin; select set_config('request.jwt.claims', '%s', true); set local role authenticated; %s; commit;"
               % (claims, q))


def ensure_agent(email, role, name):
    creds = json.load(open(CREDS_FILE)) if os.path.exists(CREDS_FILE) else {}
    pw = creds.get(email) or secrets.token_urlsafe(24)
    found = sql("select id from auth.users where email = '%s'" % email)
    if found:
        uid = found[0]["id"]
        http("PUT", "/auth/v1/admin/users/" + uid, {"password": pw, "email_confirm": True}, key=SERVICE)
    else:
        code, user = http("POST", "/auth/v1/admin/users", {"email": email, "password": pw, "email_confirm": True},
                          key=SERVICE)
        uid = user["id"]
    creds[email] = pw
    os.makedirs(os.path.dirname(CREDS_FILE), exist_ok=True)
    json.dump(creds, open(CREDS_FILE, "w"), indent=1)
    sql("""insert into admin_users (user_id, name, email, role, is_active) values ('%s', '%s', '%s', '%s', true)
           on conflict (email) do update set user_id = excluded.user_id, role = excluded.role, is_active = true"""
        % (uid, name, email, role))
    code, tok = http("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": pw})
    return tok["access_token"]


def stock(sku):
    return sql("select stock from products where sku = '%s'" % sku)[0]["stock"]


OWNER_UID = sql("select user_id from admin_users where role = 'owner' and is_active limit 1")[0]["user_id"]
SALES = ensure_agent("agent-sales@powerrun.test", "agent_sales", "Sales Agent (AI)")
SUPPORT = ensure_agent("agent-support@powerrun.test", "agent_support", "Support Agent (AI)")

sql("""insert into categories (name, slug, is_active) values ('Test Batteries', 'test-batteries', true) on conflict (slug) do nothing;
insert into products (name, slug, sku, price, mrp, stock, availability, gst_rate, price_includes_gst, hsn_code, is_active, category_id)
select 'Test Approval Battery', 'test-approval-battery', 'TEST-APR', 10000, 10000, 10, 'in_stock', 18, true, '8507', true,
       (select id from categories where slug = 'test-batteries')
where not exists (select 1 from products where sku = 'TEST-APR');
update products set stock = 10, price = 10000, availability = 'in_stock' where sku = 'TEST-APR';""")
PID = sql("select id from products where sku = 'TEST-APR'")[0]["id"]

# --- R: what an agent can and cannot see / do directly -------------------------------------------
code, rows = http("GET", "/rest/v1/orders?select=id&limit=3", token=SALES)
check("R1 sales agent can read orders", code == 200 and isinstance(rows, list) and len(rows) > 0, "HTTP %s, %s rows" % (code, len(rows) if isinstance(rows, list) else rows))
code, rows = http("GET", "/rest/v1/product_costs?select=*&limit=3", token=SALES)
check("R2 agent cannot read product costs", code != 200 or rows == [], "HTTP %s %s" % (code, rows if rows != [] else "0 rows"))
code, rows = http("GET", "/rest/v1/audit_log?select=id&limit=3", token=SALES)
check("R3 agent cannot read the audit log", code != 200 or rows == [], "HTTP %s" % code)
code, rows = http("GET", "/rest/v1/admin_users?select=email,role", token=SALES)
check("R4 agent sees only its own admin_users row", code == 200 and [r["email"] for r in rows] == ["agent-sales@powerrun.test"], rows)
code, rows = http("PATCH", "/rest/v1/products?sku=eq.TEST-APR", {"stock": 999}, token=SALES, prefer="return=representation")
check("R5 agent cannot change stock directly", stock("TEST-APR") == 10, "HTTP %s, stock %s" % (code, stock("TEST-APR")))
code, rows = http("PATCH", "/rest/v1/orders?id=not.is.null", {"notes": "agent was here"}, token=SALES, prefer="return=representation")
check("R6 agent cannot edit orders directly", code != 200 or rows == [], "HTTP %s" % code)
code, body = http("POST", "/rest/v1/rpc/admin_dashboard_stats", {}, token=SALES)
check("R7 agent cannot call admin functions", code in (401, 403), "HTTP %s" % code)
code, body = http("POST", "/rest/v1/approvals", {"action": "stock_adjust", "payload_hash": "x", "reason": "x"}, token=SALES)
check("R8 agent cannot write approvals directly", code in (401, 403), "HTTP %s" % code)

# --- L: agent write RPCs --------------------------------------------------------------------------
lead = sql("""insert into leads (name, mobile, source, status) values ('Test Lead P4', '7%09d', 'website', 'new')
              returning id""" % (uuid.uuid4().int % 10 ** 9))[0]["id"]
code, fid = http("POST", "/rest/v1/rpc/agent_add_followup", {"p_lead_id": lead, "p_customer_id": None,
                 "p_title": "Call back about 5kW", "p_notes": "test", "p_due_at": "2030-01-01T10:00:00+05:30"}, token=SUPPORT)
check("L1 agent can add a follow-up", code == 200 and sql("select count(*) n from follow_ups where id = '%s'" % fid)[0]["n"] == 1, "HTTP %s %s" % (code, fid))
code, _ = http("POST", "/rest/v1/rpc/agent_update_lead", {"p_lead_id": lead, "p_status": "contacted", "p_priority": "high"}, token=SALES)
check("L2 agent can update lead status", code in (200, 204) and sql("select status from leads where id='%s'" % lead)[0]["status"] == "contacted", "HTTP %s" % code)
code, body = http("POST", "/rest/v1/rpc/agent_update_lead", {"p_lead_id": lead, "p_status": "converted", "p_priority": None}, token=SALES)
check("L3 agent cannot mark a lead converted", code == 400, body)

# --- A: approvals ---------------------------------------------------------------------------------
def request(token, action, payload, amount=None, reason="test", table=None, target=None):
    return http("POST", "/rest/v1/rpc/request_approval", {"p_action": action, "p_target_table": table, "p_target_id": target,
                "p_payload": payload, "p_amount": amount, "p_reason": reason}, token=token)


code, req = request(SUPPORT, "stock_adjust", {"product_id": PID, "change": 5}, reason="Supplier delivered 5 units", table="products", target=PID)
check("A1 agent can request a stock adjustment", code == 200 and req.get("request_no", "").startswith("APR-"), req)
apr = sql("select * from approvals where id = '%s'" % req["id"])[0]
check("A2 request is pending, hashed, expires in 48 h, stock unchanged",
      apr["status"] == "pending" and len(apr["payload_hash"]) == 64 and stock("TEST-APR") == 10
      and sql("select (expires_at - created_at) between interval '47 hours' and interval '49 hours' ok from approvals where id='%s'" % req["id"])[0]["ok"], apr["status"])
code, body = http("POST", "/rest/v1/rpc/decide_approval", {"p_id": req["id"], "p_approve": True, "p_hash": apr["payload_hash"], "p_note": None}, token=SUPPORT)
check("A3 agent cannot approve its own request", code in (401, 403) and stock("TEST-APR") == 10, "HTTP %s" % code)
code, rows = http("GET", "/rest/v1/approvals?select=request_no", token=SALES)
check("A4 an agent sees only its own requests", code == 200 and all(r["request_no"] != req["request_no"] for r in rows), rows)

try:
    as_owner("select public.decide_approval('%s', true, 'wronghash', null)" % req["id"])
    check("A5 approving with a stale hash is refused", False, "no error")
except SystemExit as e:  # supabase_admin exits on SQL errors
    check("A5 approving with a stale hash is refused", "changed after you opened it" in str(e) and stock("TEST-APR") == 10, str(e)[:120])
res = as_owner("select public.decide_approval('%s', true, '%s', 'ok') r" % (req["id"], apr["payload_hash"]))[0]["r"]
check("A6 owner approval runs the stock change once", res.get("status") == "executed" and stock("TEST-APR") == 15, res)
reason = sql("select reason from stock_ledger where product_id = '%s' order by id desc limit 1" % PID)[0]["reason"]
check("A7 stock ledger names the approval", reason.startswith("approved " + req["request_no"]), reason)
try:
    as_owner("select public.decide_approval('%s', true, '%s', null)" % (req["id"], apr["payload_hash"]))
    check("A8 the same approval cannot run twice", False, "no error")
except SystemExit as e:  # supabase_admin exits on SQL errors
    check("A8 the same approval cannot run twice", "already executed" in str(e) and stock("TEST-APR") == 15, str(e)[:120])

code, r2 = request(SUPPORT, "stock_adjust", {"product_id": PID, "change": -3}, reason="damaged")
res = as_owner("select public.decide_approval('%s', false, null, 'no') r" % r2["id"])[0]["r"]
check("A9 rejecting changes nothing", res.get("status") == "rejected" and stock("TEST-APR") == 15, res)
code, r3 = request(SUPPORT, "stock_adjust", {"product_id": PID, "change": -3}, reason="old")
sql("update approvals set expires_at = now() - interval '1 minute' where id = '%s'" % r3["id"])
h3 = sql("select payload_hash from approvals where id='%s'" % r3["id"])[0]["payload_hash"]
res = as_owner("select public.decide_approval('%s', true, '%s', null) r" % (r3["id"], h3))[0]["r"]
check("A10 an expired request cannot be approved", res.get("status") == "expired" and stock("TEST-APR") == 15, res)

# order cancel through approval (stock returns) and a failing one (shipped order)
cust = {"name": "Test Buyer", "mobile": "9%09d" % (uuid.uuid4().int % 10 ** 9), "address": "1 Test Street",
        "city": "Agra", "state": "Uttar Pradesh", "pincode": "282001"}
code, o = http("POST", "/rest/v1/rpc/create_website_order", {"p_customer": cust, "p_items": [{"product_id": PID, "quantity": 2}],
               "p_payment_method": "cod", "p_coupon_code": None})
before = stock("TEST-APR")
code, r4 = request(SALES, "order_cancel", {"order_id": o["order_id"]}, amount=o["total_amount"], reason="Customer asked to cancel",
                   table="orders", target=o["order_id"])
h4 = sql("select payload_hash from approvals where id='%s'" % r4["id"])[0]["payload_hash"]
res = as_owner("select public.decide_approval('%s', true, '%s', null) r" % (r4["id"], h4))[0]["r"]
st = sql("select order_status from orders where id='%s'" % o["order_id"])[0]["order_status"]
check("A11 approved order cancel cancels it and returns stock", res.get("status") == "executed" and st == "cancelled"
      and stock("TEST-APR") == before + 2, "%s %s stock %s->%s" % (res.get("status"), st, before, stock("TEST-APR")))
code, o2 = http("POST", "/rest/v1/rpc/create_website_order", {"p_customer": dict(cust, mobile="8%09d" % (uuid.uuid4().int % 10 ** 9)),
                "p_items": [{"product_id": PID, "quantity": 1}], "p_payment_method": "cod", "p_coupon_code": None})
sql("update orders set order_status = 'shipped' where id = '%s'" % o2["order_id"])
code, r5 = request(SALES, "order_cancel", {"order_id": o2["order_id"]}, reason="late")
h5 = sql("select payload_hash from approvals where id='%s'" % r5["id"])[0]["payload_hash"]
res = as_owner("select public.decide_approval('%s', true, '%s', null) r" % (r5["id"], h5))[0]["r"]
row5 = sql("select status, error from approvals where id='%s'" % r5["id"])[0]
check("A12 an action that cannot run is marked failed, nothing changes", res.get("status") == "failed" and row5["status"] == "failed"
      and sql("select order_status from orders where id='%s'" % o2["order_id"])[0]["order_status"] == "shipped", row5["error"])

# --- D: 4 % discount rule on PIs ------------------------------------------------------------------
code, pino = http("POST", "/rest/v1/rpc/admin_next_pi_number", {}, token=SALES)
check("D0 sales agent can get a PI number", code == 200 and str(pino).startswith("PRI/PI/"), pino)
pi_id = str(uuid.uuid4())
pi = {"id": pi_id, "pi_number": pino, "customer_name": "Test Dealer P4", "party_type": "dealer", "status": "draft",
      "items": [{"product_id": PID, "name": "Test Approval Battery", "quantity": 2, "unit_price": 9000, "gst_rate": 18}],
      "discount_amount": 0, "total_amount": 18000}
code, body = http("POST", "/rest/v1/proforma_invoices", pi, token=SALES, prefer="return=minimal")
check("D1 agent can save a 10 % PI as a draft", code == 201, body)
code, body = http("PATCH", "/rest/v1/proforma_invoices?id=eq." + pi_id, {"status": "sent"}, token=SALES)
check("D2 agent cannot send a PI 10 % below price", code == 400 and "above 4" in json.dumps(body), body)
code, r6 = request(SALES, "discount_override", {"discount_pct": 10, "pi_number": pino}, amount=2000,
                   reason="Dealer ordering 2 every month", table="proforma_invoices", target=pi_id)
h6 = sql("select payload_hash from approvals where id='%s'" % r6["id"])[0]["payload_hash"]
res = as_owner("select public.decide_approval('%s', true, '%s', null) r" % (r6["id"], h6))[0]["r"]
code, body = http("PATCH", "/rest/v1/proforma_invoices?id=eq." + pi_id, {"status": "sent"}, token=SALES)
check("D3 after owner approval the agent can send it", res.get("status") == "approved" and code == 204, "%s HTTP %s %s" % (res, code, body))
code, body = http("PATCH", "/rest/v1/proforma_invoices?id=eq." + pi_id,
                  {"items": [dict(pi["items"][0], unit_price=8500)], "total_amount": 17000}, token=SALES)
check("D4 approval for 10 % does not cover 15 %", code == 400, body)

pi2 = dict(pi, id=str(uuid.uuid4()), pi_number=http("POST", "/rest/v1/rpc/admin_next_pi_number", {}, token=SALES)[1], status="sent",
           items=[dict(pi["items"][0], unit_price=9700)], total_amount=19400)
code, body = http("POST", "/rest/v1/proforma_invoices", pi2, token=SALES, prefer="return=minimal")
check("D5 a 3 % discount needs no approval", code == 201, body)
pi3 = str(uuid.uuid4())
as_owner("""insert into proforma_invoices (id, pi_number, customer_name, status, items, total_amount)
            values ('%s', 'TEST/PI/OWNER', 'Owner test', 'sent',
                    '[{"product_id": "%s", "name": "x", "quantity": 1, "unit_price": 7000}]', 7000)""" % (pi3, PID))
check("D6 the owner is never blocked (30 % sent)", sql("select count(*) n from proforma_invoices where id='%s'" % pi3)[0]["n"] == 1)
code, body = http("PATCH", "/rest/v1/proforma_invoices?id=eq." + pi_id, {"invoice_number": "PR/99-99/0001"}, token=SALES,
                  prefer="return=representation")
check("D7 agent cannot issue a tax invoice number", code != 200 or body == [] or body is None
      and sql("select invoice_number from proforma_invoices where id='%s'" % pi_id)[0]["invoice_number"] is None, "HTTP %s" % code)
code, body = http("DELETE", "/rest/v1/proforma_invoices?id=eq." + pi_id, token=SALES, prefer="return=representation")
check("D8 agent cannot delete a PI", sql("select count(*) n from proforma_invoices where id='%s'" % pi_id)[0]["n"] == 1, "HTTP %s" % code)

# --- S: owner stats, anon -------------------------------------------------------------------------
st = as_owner("select public.admin_dashboard_stats() s")[0]["s"]
check("S1 owner dashboard has approvals_pending", "approvals_pending" in st, st.get("approvals_pending"))
code, rows = http("GET", "/rest/v1/approvals?select=id&limit=1")
check("S2 anon cannot read approvals", code != 200 or rows == [], "HTTP %s" % code)
code, rows = http("GET", "/rest/v1/orders?select=id&limit=1")
check("S3 anon still cannot read orders", code != 200 or rows == [], "HTTP %s" % code)
check("S4 owner is still a full admin", as_owner("select public.is_admin() a, public.is_owner() o")[0] == {"a": True, "o": True})

# clean up synthetic rows (approvals kept: they are history, staging only)
sql("""delete from follow_ups where lead_id = '%s'; delete from leads where id = '%s';
       delete from proforma_invoices where id in ('%s', '%s', '%s');""" % (lead, lead, pi_id, pi2["id"], pi3))

for name, ok, detail in results:
    print("%s  %s  %s" % ("PASS" if ok else "FAIL", name, detail[:160]))
print("%d/%d passed" % (sum(1 for r in results if r[1]), len(results)))
