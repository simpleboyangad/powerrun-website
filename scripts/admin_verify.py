#!/usr/bin/env python
"""
PowerRun Industries - verify the admin path end to end as a REAL signed-in admin.

Signs in with Supabase Auth using the credentials file written by
pr_data.py create-admin, then exercises the admin RLS policies with that
user's access token (NOT service_role, which would bypass RLS and prove
nothing).

The password and tokens are never printed.

Usage
-----
  python scripts/admin_verify.py check
  python scripts/admin_verify.py set-status PR-2026-00001 confirmed
  python scripts/admin_verify.py session-file      # for the browser UI test
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

PROJECT_REF = "nnkopxkyxcmtiunftlgr"
BASE = "https://{}.supabase.co".format(PROJECT_REF)
ANON = "sb_publishable_n5WIw0oyN0w8K6Z5mlfawA_QbM7iHqf"
CRED_FILE = os.path.join(os.path.expanduser("~"), ".powerrun", "powerrun-admin-credentials.txt")


def credentials():
    if not os.path.isfile(CRED_FILE):
        sys.exit("Credentials file not found: " + CRED_FILE)
    text = open(CRED_FILE, encoding="utf-8").read()
    email = re.search(r"^Email\s*:\s*(.+)$", text, re.M)
    password = re.search(r"^Password\s*:\s*(.+)$", text, re.M)
    if not email or not password:
        sys.exit("Could not parse the credentials file.")
    return email.group(1).strip(), password.group(1).strip()


def call(path, method="GET", payload=None, token=None, prefer=None):
    headers = {"apikey": ANON, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method, headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            body = response.read().decode()
            return response.status, (json.loads(body) if body.strip() else None)
    except urllib.error.HTTPError as err:
        body = err.read().decode(errors="replace")
        try:
            return err.code, json.loads(body)
        except ValueError:
            return err.code, {"message": body[:300]}


_session = {}


def sign_in():
    if "s" in _session:
        return _session["s"]
    email, password = credentials()
    status, data = call("/auth/v1/token?grant_type=password", "POST",
                        {"email": email, "password": password})
    if status != 200 or not data.get("access_token"):
        sys.exit("Admin sign-in failed ({}): {}".format(status, (data or {}).get("error_description") or data))
    _session["s"] = data
    return data


def cmd_check():
    session = sign_in()
    token = session["access_token"]
    print("Signed in as       :", session["user"]["email"])

    status, is_admin = call("/rest/v1/rpc/is_admin", "POST", {}, token)
    print("is_admin() says    :", is_admin, "(HTTP {})".format(status))

    status, stats = call("/rest/v1/rpc/admin_dashboard_stats", "POST", {}, token)
    if status != 200:
        sys.exit("admin_dashboard_stats failed: {}".format(stats))
    keys = ["total_products", "active_products", "total_orders", "pending_orders",
            "processing_orders", "completed_orders", "cancelled_orders",
            "total_customers", "warranty_requests", "service_requests",
            "dealer_enquiries", "revenue_total"]
    print("\nDashboard counters:")
    for key in keys:
        print("  {:<20} {}".format(key, stats.get(key)))

    status, orders = call(
        "/rest/v1/orders?select=order_number,customer_name,total_amount,order_status"
        "&order=created_at.desc&limit=5", token=token)
    print("\nAdmin can read orders: HTTP {} -> {} rows".format(status, len(orders or [])))
    for order in orders or []:
        print("  {}  {:<16} {:>12}  {}".format(
            order["order_number"], order["customer_name"],
            order["total_amount"], order["order_status"]))


def cmd_set_status(order_number, new_status):
    session = sign_in()
    token = session["access_token"]

    status, before = call(
        "/rest/v1/orders?order_number=eq.{}&select=id,order_status".format(order_number), token=token)
    if not before:
        sys.exit("Order not found: " + order_number)
    order_id = before[0]["id"]
    print("Before : {} -> {}".format(order_number, before[0]["order_status"]))

    status, result = call("/rest/v1/orders?id=eq.{}".format(order_id), "PATCH",
                          {"order_status": new_status}, token, prefer="return=representation")
    if status not in (200, 204):
        sys.exit("Update refused (HTTP {}): {}".format(status, result))

    status, after = call(
        "/rest/v1/orders?order_number=eq.{}&select=order_status,updated_at".format(order_number), token=token)
    print("After  : {} -> {}   (updated_at {})".format(
        order_number, after[0]["order_status"], after[0].get("updated_at")))
    print("Write accepted by RLS as a real admin user.")


def cmd_session_file():
    """Write the Supabase session to a temp file so the browser can adopt it.

    Keeps the access token out of this transcript. Delete the file afterwards.
    """
    session = sign_in()
    target = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "__pr_session.json")
    with open(target, "w", encoding="utf-8") as handle:
        json.dump(session, handle)
    print("Session written to __pr_session.json (delete after the UI test).")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    command = sys.argv[1]
    if command == "check":
        cmd_check()
    elif command == "set-status":
        cmd_set_status(sys.argv[2], sys.argv[3])
    elif command == "session-file":
        cmd_session_file()
    else:
        sys.exit("Unknown command: " + command)


if __name__ == "__main__":
    main()
