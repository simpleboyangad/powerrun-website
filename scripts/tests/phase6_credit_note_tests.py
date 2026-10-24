#!/usr/bin/env python
"""
PowerRun Industries - Phase 6a tests (GST credit notes). STAGING ONLY.

    POWERRUN_PROJECT_REF=<staging ref> python scripts/tests/phase6_credit_note_tests.py

Needs migrations 37-39 on staging and the Phase 4 test agents. Lines are built the way
assets/js/credit-note-doc.js builds them (from the invoice's stored taxable/GST values).
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
    try:
        return True, sa.run_sql("begin; select set_config('request.jwt.claims', '%s', true); set local role authenticated; %s; commit;"
                                % (claims, q))
    except SystemExit as e:
        return False, str(e)


def rpc_anon(fn, body):
    req = urllib.request.Request(BASE + "/rest/v1/rpc/" + fn, data=json.dumps(body).encode(), method="POST",
                                 headers={"apikey": ANON, "Authorization": "Bearer " + ANON, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def r2(x):
    return round(float(x) + 1e-9, 2)


def issue(source, sid, reason, lines, round_off=0, restock=False):
    return as_owner("select public.admin_issue_credit_note('%s', '%s', '%s', 'test', '%s'::jsonb, %s, %s) r"
                    % (source, sid, reason, json.dumps(lines).replace("'", "''"), round_off, "true" if restock else "false"))


def order_lines(order_id, qty=None, intra=True):
    out = []
    for it in sql("select id, product_id, product_name, hsn_code, quantity, gst_rate, taxable_amount, gst_amount "
                  "from order_items where order_id = '%s' order by created_at" % order_id):
        q = it["quantity"] if qty is None else qty
        ratio = q / it["quantity"]
        taxable, tax = r2(float(it["taxable_amount"]) * ratio), r2(float(it["gst_amount"]) * ratio)
        cg = r2(tax / 2) if intra else 0
        out.append({"key": "item:" + it["id"], "name": it["product_name"], "hsn": it["hsn_code"], "qty": q,
                    "rate": float(it["gst_rate"]), "taxable": taxable, "cgst": cg, "sgst": r2(tax - cg) if intra else 0,
                    "igst": 0 if intra else tax, "total": r2(taxable + tax), "product_id": it["product_id"]})
    return out


def new_order(sku, qty, state="Uttar Pradesh"):
    pid = sql("select id from products where sku = '%s'" % sku)[0]["id"]
    o = rpc_anon("create_website_order", {"p_customer": {"name": "Test CN", "mobile": "9%09d" % (uuid.uuid4().int % 10 ** 9),
                 "address": "1 Test Street", "city": "Agra", "state": state, "pincode": "282001"},
                 "p_items": [{"product_id": pid, "quantity": qty}], "p_payment_method": "cod", "p_coupon_code": None})
    as_owner("select public.issue_tax_invoice('%s')" % o["order_id"])
    return o


sql("""insert into categories (name, slug, is_active) values ('Test Batteries', 'test-batteries', true) on conflict (slug) do nothing;
insert into products (name, slug, sku, price, mrp, stock, availability, gst_rate, price_includes_gst, hsn_code, is_active, category_id)
select 'Test CN Battery', 'test-cn-battery', 'TEST-CN', 11800, 11800, 50, 'in_stock', 18, true, '8507', true,
       (select id from categories where slug = 'test-batteries')
where not exists (select 1 from products where sku = 'TEST-CN');
update products set stock = 50, availability = 'in_stock' where sku = 'TEST-CN';""")
sql("""insert into site_settings (key, value) values ('company', '{"legal_name": "PowerRun Industries (staging)", "state": "Uttar Pradesh", "gstin": "09GTVPS7660P1ZZ"}')
       on conflict (key) do nothing""")
check("P0 staging company state is set", sql("select value ->> 'state' s from site_settings where key = 'company'")[0]["s"], "")

# C1 full credit note
o = new_order("TEST-CN", 1)
total = float(sql("select total_amount from orders where id = '%s'" % o["order_id"])[0]["total_amount"])
lines = order_lines(o["order_id"])
ok, res = issue("order", o["order_id"], "order_cancelled", lines, round_off=r2(total - sum(l["total"] for l in lines)))
cn = res[0]["r"] if ok else {}
check("C1 full credit note issued with a 16-character number", ok and cn["cn_number"].startswith("PR/CN/") and len(cn["cn_number"]) <= 16
      and abs(float(cn["total_amount"]) - total) < 0.01, res)
ok, res = issue("order", o["order_id"], "other", lines)
check("C2 the same invoice cannot be credited twice over", not ok and ("already credited" in res or "already" in res), res[-160:])

# C3 partial by quantity
o2 = new_order("TEST-CN", 2)
ok, res = issue("order", o2["order_id"], "goods_returned", order_lines(o2["order_id"], qty=1))
check("C3 one of two units credited", ok, res if not ok else res[0]["r"]["cn_number"])
ok, res = issue("order", o2["order_id"], "goods_returned", order_lines(o2["order_id"], qty=2))
check("C4 crediting more units than invoiced is refused", not ok and "already credited" in res, res[-160:])

# C5 bad maths / wrong tax type
bad = order_lines(o2["order_id"], qty=1)
bad[0]["cgst"] = r2(bad[0]["cgst"] + 50); bad[0]["total"] = r2(bad[0]["total"] + 50)
ok, res = issue("order", o2["order_id"], "goods_returned", bad)
check("C5 tax that does not match the rate is refused", not ok and "does not match" in res, res[-140:])
igst = order_lines(o2["order_id"], qty=1, intra=False)
ok, res = issue("order", o2["order_id"], "goods_returned", igst)
check("C6 IGST on a same-state invoice is refused", not ok and "CGST + SGST" in res, res[-140:])

# C7 restock on return
before = sql("select stock from products where sku = 'TEST-CN'")[0]["stock"]
o3 = new_order("TEST-CN", 1)
after_order = sql("select stock from products where sku = 'TEST-CN'")[0]["stock"]
ok, res = issue("order", o3["order_id"], "goods_returned", order_lines(o3["order_id"]), restock=True)
now = sql("select stock from products where sku = 'TEST-CN'")[0]["stock"]
num = res[0]["r"]["cn_number"] if ok else ""
led = sql("select reason from stock_ledger l join products p on p.id = l.product_id where p.sku = 'TEST-CN' order by l.id desc limit 1")[0]["reason"]
check("C7 returned goods go back into stock, ledger names the note", ok and after_order == before - 1 and now == before
      and led == "credit note " + num, "%s %s %s %s" % (before, after_order, now, led))

# C8 restock refused for a cancelled order (stock already returned)
o4 = new_order("TEST-CN", 1)
as_owner("update orders set order_status = 'cancelled' where id = '%s'" % o4["order_id"])
ok, res = issue("order", o4["order_id"], "order_cancelled", order_lines(o4["order_id"]), restock=True)
check("C8 no double restock for a cancelled order", not ok and "already returned" in res, res[-140:])
ok, res = issue("order", o4["order_id"], "order_cancelled", order_lines(o4["order_id"]))
check("C9 cancelled order gets its credit note without restock", ok, res if not ok else "")

# C10 no invoice -> refused
pid = sql("select id from products where sku = 'TEST-CN'")[0]["id"]
o5 = rpc_anon("create_website_order", {"p_customer": {"name": "Test CN", "mobile": "8%09d" % (uuid.uuid4().int % 10 ** 9),
              "address": "1 Test Street", "city": "Agra", "state": "Uttar Pradesh", "pincode": "282001"},
              "p_items": [{"product_id": pid, "quantity": 1}], "p_payment_method": "cod", "p_coupon_code": None})
ok, res = issue("order", o5["order_id"], "other", order_lines(o5["order_id"]))
check("C10 an order without a tax invoice cannot get a credit note", not ok and "no tax invoice" in res, res[-120:])

# C11 frozen
cn_id = sql("select id from credit_notes where cn_number = '%s'" % cn["cn_number"])[0]["id"] if cn else None
ok1, r1 = as_owner("update credit_notes set note = 'x' where id = '%s'" % cn_id)
ok2, r2_ = as_owner("delete from credit_notes where id = '%s'" % cn_id)
try:
    sql("delete from credit_notes where id = '%s'" % cn_id)
    ok3 = True
except SystemExit:
    ok3 = False
check("C11 an issued credit note cannot be changed or deleted (even by the database owner)", not ok1 and not ok2 and not ok3)

# C12 PI source, other-state buyer, amount credit
pi_id = str(uuid.uuid4())
sql("""insert into proforma_invoices (id, pi_number, customer_name, business_name, gstin, state, status, items, total_amount)
       values ('%s', 'TEST/PI/CN', 'Dealer Test', 'Test Traders', '07AAAAA0000A1Z5', 'Delhi', 'sent',
               '[{"product_name": "Test CN Battery", "quantity": 2, "unit_price": 11800, "gst_rate": 18, "hsn_code": "8507"}]', 23600)""" % pi_id)
as_owner("select public.issue_pi_tax_invoice('%s')" % pi_id)
amount = 1180.0
taxable = r2(amount / 1.18)
line = {"key": "line:0", "name": "Test CN Battery", "hsn": "8507", "qty": 0, "rate": 18, "taxable": taxable,
        "cgst": 0, "sgst": 0, "igst": r2(amount - taxable), "total": amount, "product_id": None}
ok, res = issue("pi", pi_id, "price_reduction", [line])
row = sql("select intra_state, igst_amount, place_of_supply from credit_notes where pi_id = '%s'" % pi_id) if ok else res
check("C12 PI tax invoice: price reduction to an other-state dealer uses IGST", ok and row[0]["intra_state"] is False
      and float(row[0]["igst_amount"]) == 180 and row[0]["place_of_supply"] == "Delhi", row)

# C13/14 agents and anon
os.environ["POWERRUN_PROJECT_REF"] = sa.PROJECT_REF
import agent_client as ac  # noqa: E402
key, tok = ac.sign_in("sales")
rows = ac.call("GET", "/rest/v1/credit_notes?select=cn_number", key, tok)
check("C13 sales agent can read credit notes", len(rows) >= 4, len(rows))
req = urllib.request.Request(BASE + "/rest/v1/rpc/admin_issue_credit_note", method="POST", data=json.dumps({
    "p_source_type": "order", "p_source_id": o2["order_id"], "p_reason": "other", "p_note": None,
    "p_lines": order_lines(o2["order_id"], qty=1), "p_round_off": 0, "p_restock": False}).encode(),
    headers={"apikey": key, "Authorization": "Bearer " + tok, "Content-Type": "application/json"})
try:
    urllib.request.urlopen(req, timeout=60)
    check("C14 an agent cannot issue a credit note", False, "accepted")
except urllib.error.HTTPError as e:
    check("C14 an agent cannot issue a credit note", e.code == 403, "HTTP %s" % e.code)
req = urllib.request.Request(BASE + "/rest/v1/credit_notes?select=id&limit=1", headers={"apikey": ANON, "Authorization": "Bearer " + ANON})
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        check("C15 anon cannot read credit notes", json.loads(r.read().decode()) == [])
except urllib.error.HTTPError as e:
    check("C15 anon cannot read credit notes", True, "HTTP %s" % e.code)

for name, ok, detail in results:
    print("%s  %s  %s" % ("PASS" if ok else "FAIL", name, detail[:160]))
print("%d/%d passed" % (sum(1 for r in results if r[1]), len(results)))
