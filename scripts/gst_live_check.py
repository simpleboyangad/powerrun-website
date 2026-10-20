#!/usr/bin/env python
"""
PowerRun Industries - check the GST order flow on the LIVE database without
leaving anything behind.

Places three orders through create_website_order() (the same function the
checkout page calls) inside ONE transaction, prints what was stored, then
ROLLS BACK: no order, customer, stock change or invoice number survives.

  1. normal customer, billing state = company state   -> CGST + SGST
  2. GST customer with a GSTIN from another state     -> IGST, GSTIN saved
  3. GSTIN whose state does not match billing state   -> must be refused
  4. GSTIN with a wrong check character               -> must be refused

The order number sequence cannot be rolled back, so afterwards it is set back
to where it was - but only if no real order took a number in the meantime.

Uses the same credentials as pg_exec.py (SUPABASE_ACCESS_TOKEN + PGPASSWORD):

  python scripts/gst_live_check.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pg_exec  # noqa: E402

SEQ = "public.pr_order_number_seq"
OTHER_STATE_GSTIN = ("27AAPFU0939F1ZV", "Maharashtra")   # public sample GSTIN


def one(cursor, sql, args=()):
    cursor.execute(sql, args)
    row = cursor.fetchone()
    return row[0] if row else None


def main():
    conn = pg_exec.connect()
    conn.autocommit = False
    cur = conn.cursor()
    results, ok = [], True
    seq_before = None
    try:
        seq_before = one(cur, "select last_value from " + SEQ)
        company_state = one(cur, "select value->>'state' from site_settings where key = 'company'") or 'Uttar Pradesh'
        product = None
        cur.execute("""select id, name, price from products
                        where coalesce(is_active, true) and price > 0 and coalesce(stock, 0) > 0
                          and coalesce(availability, 'in_stock') = 'in_stock' and coalesce(gst_rate, 0) > 0
                        order by price limit 1""")
        product = cur.fetchone()
        if not product:
            sys.exit("No active in-stock product found to test with.")
        print("Company state : %s" % company_state)
        print("Test product  : %s (Rs %s)\n" % (product[1], product[2]))

        base = {"name": "GST TEST - rolled back", "mobile": "9999999999", "email": None,
                "address": "Test address", "city": "Test", "pincode": "411001", "shipping_same": True}
        cases = [
            ("Normal customer, %s" % company_state, dict(base, state=company_state), "cgst"),
            ("GST customer, %s GSTIN" % OTHER_STATE_GSTIN[1],
             dict(base, state=OTHER_STATE_GSTIN[1], gstin=OTHER_STATE_GSTIN[0], business_name="Test Traders"), "igst"),
            ("GSTIN state != billing state",
             dict(base, state=company_state, gstin=OTHER_STATE_GSTIN[0], business_name="Test Traders"), "error"),
            ("Wrong GSTIN check character",
             dict(base, state=OTHER_STATE_GSTIN[1], gstin="27AAPFU0939F1ZX", business_name="Test Traders"), "error"),
        ]
        items = json.dumps([{"product_id": str(product[0]), "quantity": 1}])

        for label, customer, expect in cases:
            cur.execute("savepoint t")
            try:
                cur.execute("select public.create_website_order(%s::jsonb, %s::jsonb, 'cod', null)",
                            (json.dumps(customer), items))
                result = cur.fetchone()[0]
                if isinstance(result, str):
                    result = json.loads(result)
                cur.execute("""select customer_gstin, customer_business_name, place_of_supply,
                                      cgst_amount, sgst_amount, igst_amount, total_amount
                                 from orders where id = %s""", (result["order_id"],))
                g, b, pos, cgst, sgst, igst, total = cur.fetchone()
                passed = (expect == "cgst" and cgst > 0 and igst == 0 and not g) or \
                         (expect == "igst" and igst > 0 and cgst == 0 and g == OTHER_STATE_GSTIN[0])
                print("%s  %s\n      GSTIN=%s  place of supply=%s  CGST=%s SGST=%s IGST=%s  total=%s"
                      % ("PASS" if passed else "FAIL", label, g or "-", pos, cgst, sgst, igst, total))
                cur.execute("release savepoint t")
            except Exception as err:      # noqa: BLE001
                cur.execute("rollback to savepoint t")
                message = err.args[0].get("M") if err.args and isinstance(err.args[0], dict) else str(err)
                passed = expect == "error"
                print("%s  %s\n      refused: %s" % ("PASS" if passed else "FAIL", label, message))
            ok = ok and passed

        counters = one(cur, "select count(*) from public.invoice_counters")
        print("\nTax invoice counters table: present (%s financial years used so far)" % counters)
    finally:
        conn.rollback()
        print("\nRolled back - no test order was kept.")
        if seq_before is not None:
            cur.execute("select last_value from " + SEQ)
            now = cur.fetchone()[0]
            used = now - seq_before
            # put the order numbers back only if nobody else ordered meanwhile (all ours: <= 2 successes)
            if 0 < used <= 2:
                cur.execute("select setval(%s, %s) where (select last_value from " + SEQ + ") = %s",
                            (SEQ, seq_before, now))
                conn.commit()
                print("Order number sequence restored to %s." % seq_before)
        cur.close()
        conn.close()

    print("\nALL CHECKS PASSED" if ok else "\nSOME CHECKS FAILED - send this output")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
