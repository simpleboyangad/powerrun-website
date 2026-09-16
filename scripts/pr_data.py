#!/usr/bin/env python
"""
PowerRun Industries - data-plane helper.

Uses the project's service_role key, fetched from the Management API at run time.
The key is never printed, never written to disk, and never passed on a command
line. service_role bypasses RLS, so this can do every DATA operation (seed,
insert, update, auth admin) - but it cannot perform DDL.

Usage
-----
  python scripts/pr_data.py ping
  python scripts/pr_data.py seed-prices
  python scripts/pr_data.py get  products "select=sku,price,stock&limit=5"
"""
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import supabase_admin as sa  # noqa: E402

BASE = "https://{}.supabase.co".format(sa.PROJECT_REF)
_key_cache = {}


def service_key():
    if "k" not in _key_cache:
        keys = sa.api_request("/projects/{}/api-keys".format(sa.PROJECT_REF))
        for entry in keys or []:
            if entry.get("name") == "service_role":
                _key_cache["k"] = entry["api_key"]
                break
        else:
            sys.exit("service_role key is not available with this token.")
    return _key_cache["k"]


def request(path, method="GET", payload=None, extra_headers=None):
    key = service_key()
    headers = {
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
    }
    headers.update(extra_headers or {})
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            body = response.read().decode()
            return json.loads(body) if body.strip() else None
    except urllib.error.HTTPError as err:
        detail = err.read().decode(errors="replace").replace(key, "<redacted>")
        raise RuntimeError("HTTP {} {} -> {}".format(err.code, path, detail[:1500]))


def rest(table, query="", method="GET", payload=None, prefer=None):
    headers = {"Prefer": prefer} if prefer else None
    path = "/rest/v1/{}{}".format(table, ("?" + query) if query else "")
    return request(path, method=method, payload=payload, extra_headers=headers)


# --------------------------------------------------------------------------
# Catalogue seed limited to columns that already exist (pre-DDL).
# Values mirror sql/04_seed.sql so the two can never disagree.
# --------------------------------------------------------------------------
PRICES = {
    "PR-001": 180000, "PR-002": 200000, "PR-003": 250000, "PR-004": 280000,
    "PR-005": 320000, "PR-006": 350000, "PR-007": 120000, "PR-008": 180000,
    "PR-009": 220000, "PR-010": 280000, "PR-011": 150000, "PR-012": 200000,
    "PR-013": 250000, "PR-014": 320000, "PR-015": 400000, "PR-016": 500000,
    "PR-017": 35000, "PR-018": 45000, "PR-019": 50000, "PR-020": 55000,
    "PR-021": 60000, "PR-022": 95000, "PR-023": 110000, "PR-024": 125000,
    "PR-025": 140000,
}

WARRANTY_BY_PREFIX = [
    ("PR Hybrid Inverter", "2 Years Comprehensive Warranty"),
    ("PR LFP Battery", "5 Years Warranty"),
    ("PR Solar Panel", "10 Years Product / 25 Years Performance Warranty"),
    ("PR E-Rickshaw Battery", "18 Months Warranty"),
]


def warranty_for(name):
    for prefix, text in WARRANTY_BY_PREFIX:
        if name.startswith(prefix):
            return text
    return "Manufacturer Warranty"


def cmd_seed_prices():
    products = rest("products", "select=id,sku,name,price,stock")
    updated, skipped = 0, 0
    for product in products:
        price = PRICES.get(product["sku"])
        if price is None:
            skipped += 1
            continue
        mrp = int(round(price * 1.18 / 500.0) * 500)
        rest(
            "products",
            "id=eq.{}".format(product["id"]),
            method="PATCH",
            payload={
                "price": price,
                "mrp": mrp,
                "compare_price": mrp,
                "stock": 25,
                "warranty": warranty_for(product["name"]),
                "is_active": True,
            },
            prefer="return=minimal",
        )
        updated += 1
    print("Products priced: {}  (skipped, no SKU match: {})".format(updated, skipped))

    check = rest("products", "select=sku,price,mrp,stock&order=sku&limit=3")
    print(json.dumps(check, indent=2))
    summary = rest("products", "select=id&price=not.is.null", prefer="count=exact")
    print("Products with a price now:", len(summary))


def cmd_create_admin(email, name):
    """Create the Supabase Auth user and its admin_users row.

    The generated password is written to a file in the user's home directory
    and is never printed to the console or stored in this repository.
    """
    import secrets, string

    existing = request("/auth/v1/admin/users?per_page=200")
    users = existing.get("users", existing) if isinstance(existing, dict) else existing
    match = next((u for u in users if (u.get("email") or "").lower() == email.lower()), None)

    alphabet = string.ascii_letters + string.digits + "!@#$%^&*-_=+"
    password = "".join(secrets.choice(alphabet) for _ in range(24))

    if match:
        user_id = match["id"]
        request("/auth/v1/admin/users/" + user_id, method="PUT",
                payload={"password": password, "email_confirm": True})
        action = "existing auth user found; password reset"
    else:
        created = request("/auth/v1/admin/users", method="POST", payload={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"name": name, "role": "admin"},
        })
        user_id = created["id"]
        action = "auth user created"

    rows = rest("admin_users", "user_id=eq.{}&select=id".format(user_id))
    if rows:
        rest("admin_users", "user_id=eq.{}".format(user_id), method="PATCH",
             payload={"name": name, "email": email, "role": "owner", "is_active": True},
             prefer="return=minimal")
        row_action = "admin_users row updated"
    else:
        rest("admin_users", method="POST",
             payload={"user_id": user_id, "name": name, "email": email,
                      "role": "owner", "is_active": True},
             prefer="return=minimal")
        row_action = "admin_users row created"

    target = os.path.join(os.path.expanduser("~"), ".powerrun", "powerrun-admin-credentials.txt")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w", encoding="utf-8") as handle:
        handle.write(os.linesep.join([
            "PowerRun Industries - admin login",
            "=================================",
            "URL      : https://powerrun.in/admin/login/",
            "Email    : " + email,
            "Password : " + password,
            "",
            "Change this password after your first sign-in, then delete this file.",
        ]))

    print(action)
    print(row_action)
    print("User id  :", user_id)
    print("Password : written to", target, "(not shown here)")


def cmd_ping():
    rows = rest("products", "select=id&limit=1")
    print("service_role reaches PostgREST. Sample rows:", len(rows))
    print("Key was fetched at run time and never printed.")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    command = sys.argv[1]
    if command == "ping":
        cmd_ping()
    elif command == "seed-prices":
        cmd_seed_prices()
    elif command == "create-admin":
        cmd_create_admin(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "PowerRun Administrator")
    elif command == "get":
        print(json.dumps(rest(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else ""), indent=2, default=str))
    else:
        sys.exit("Unknown command: " + command)


if __name__ == "__main__":
    main()
