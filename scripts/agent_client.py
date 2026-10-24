#!/usr/bin/env python
"""
PowerRun Industries - data access for the AI agents, with the agent's OWN limited login.

Unlike pr_data.py (service_role, bypasses every rule), this signs in as an agent account
(admin_users.role agent_sales / agent_support / agent_ops), so the database's row-level
security decides what it may see and do: read orders, leads, quotations, PIs, tickets ...;
write only follow-ups, lead status, PI drafts (sales) and approval requests. Costs, the
audit log and settings are not readable; nothing risky happens without the owner's
approval in Admin -> Approval Center.

The agent's password is kept in %USERPROFILE%\\.powerrun\\agent-<name>.dpapi, encrypted with
Windows DPAPI (only this Windows user on this PC can read it). Nothing is printed.

Usage (PYTHONUTF8=1):
  python scripts/agent_client.py --agent sales whoami
  python scripts/agent_client.py --agent sales get orders "select=order_number,order_status&limit=5"
  python scripts/agent_client.py --agent support rpc agent_add_followup '{"p_lead_id": "...", ...}'
  python scripts/agent_client.py --agent sales save-report --kind sales_support --file private/reports/<date>-sales-support.md \\
         --summary "Aaj 5 kaam: ..." [--title "..."] [--date YYYY-MM-DD]     (shows in Admin -> Agent Report)
  python scripts/agent_client.py --agent sales request stock_adjust '{"product_id": "...", "change": 5}' \\
         --reason "Supplier delivered 5" [--amount 0] [--target-table products --target-id <uuid>]

Staging: set POWERRUN_PROJECT_REF=<staging ref>; credentials then come from
%USERPROFILE%\\.powerrun\\staging-agents.json (written by scripts/tests/phase4_staging_tests.py).
"""
import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOME = os.path.join(os.path.expanduser("~"), ".powerrun")
PROD_REF = "nnkopxkyxcmtiunftlgr"
REF = os.environ.get("POWERRUN_PROJECT_REF") or PROD_REF
BASE = "https://%s.supabase.co" % REF
EMAILS = {"sales": "agent-sales@powerrun.in", "support": "agent-support@powerrun.in", "ops": "agent-ops@powerrun.in"}
STAGING_EMAILS = {k: v.replace("@powerrun.in", "@powerrun.test") for k, v in EMAILS.items()}


def ps(script, stdin=None):
    r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
                       input=stdin, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip().splitlines()[-1] if r.stderr.strip() else "PowerShell failed")
    return r.stdout.strip()


def dpapi_file(agent):
    return os.path.join(HOME, "agent-%s.dpapi" % agent)


def remember_password(agent, password):
    os.makedirs(HOME, exist_ok=True)
    blob = ps("$s = [Console]::In.ReadToEnd().Trim() | ConvertTo-SecureString -AsPlainText -Force; "
              "$s | ConvertFrom-SecureString", stdin=password)
    with open(dpapi_file(agent), "w", encoding="ascii") as f:
        f.write(blob)


def recall_password(agent):
    if REF != PROD_REF:
        creds = json.load(open(os.path.join(HOME, "staging-agents.json")))
        return STAGING_EMAILS[agent], creds[STAGING_EMAILS[agent]]
    path = dpapi_file(agent)
    if not os.path.isfile(path):
        sys.exit("No login saved for the %s agent on this PC (%s missing)." % (agent, path))
    return EMAILS[agent], ps("$s = Get-Content -Raw '%s' | ConvertTo-SecureString; "
                             "[System.Net.NetworkCredential]::new('', $s).Password" % path.replace("'", "''"))


def public_key():
    if REF == PROD_REF:
        text = open(os.path.join(ROOT, "assets", "js", "config.js"), encoding="utf-8").read()
        return re.search(r"SUPABASE_PUBLISHABLE_KEY:\s*'([^']+)'", text).group(1)
    sys.path.insert(0, os.path.join(ROOT, "scripts"))
    import supabase_admin as sa  # staging only: the anon key comes from the Management API
    return next(k["api_key"] for k in sa.api_request("/projects/%s/api-keys" % REF) if k.get("name") == "anon")


def call(method, path, key, token=None, body=None, prefer=None):
    headers = {"apikey": key, "Authorization": "Bearer " + (token or key), "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(BASE + path, method=method, headers=headers,
                                 data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            msg = json.loads(raw).get("message") or json.loads(raw).get("msg") or raw
        except ValueError:
            msg = raw
        sys.exit("HTTP %s: %s" % (e.code, str(msg)[:500]))


def sign_in(agent):
    key = public_key()
    email, password = recall_password(agent)
    tok = call("POST", "/auth/v1/token?grant_type=password", key, body={"email": email, "password": password})
    return key, tok["access_token"]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--agent", required=True, choices=sorted(EMAILS))
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("whoami")
    g = sub.add_parser("get"); g.add_argument("table"); g.add_argument("query", nargs="?", default="select=*&limit=20")
    r = sub.add_parser("rpc"); r.add_argument("fn"); r.add_argument("args", nargs="?", default="{}")
    q = sub.add_parser("request")
    q.add_argument("action"); q.add_argument("payload")
    q.add_argument("--reason", required=True); q.add_argument("--amount", type=float)
    q.add_argument("--target-table"); q.add_argument("--target-id")
    sv = sub.add_parser("save-report")
    sv.add_argument("--kind", required=True, choices=["sales_support", "seo", "instagram", "monthly", "other"])
    sv.add_argument("--file", required=True); sv.add_argument("--summary", default="")
    sv.add_argument("--title"); sv.add_argument("--date")
    a = ap.parse_args()

    key, token = sign_in(a.agent)
    if a.cmd == "whoami":
        out = {"role": call("POST", "/rest/v1/rpc/pr_my_role", key, token, {}),
               "project": "production" if REF == PROD_REF else "staging"}
    elif a.cmd == "get":
        out = call("GET", "/rest/v1/%s?%s" % (a.table, a.query), key, token)
    elif a.cmd == "rpc":
        out = call("POST", "/rest/v1/rpc/" + a.fn, key, token, json.loads(a.args))
    elif a.cmd == "save-report":
        body = open(a.file, encoding="utf-8").read()
        first = next((ln.lstrip("# ").strip() for ln in body.splitlines() if ln.strip()), a.kind)
        out = {"saved": call("POST", "/rest/v1/rpc/agent_save_report", key, token, {
            "p_kind": a.kind, "p_date": a.date, "p_title": a.title or first[:200],
            "p_summary": a.summary or None, "p_body": body})}
    else:
        out = call("POST", "/rest/v1/rpc/request_approval", key, token, {
            "p_action": a.action, "p_target_table": a.target_table, "p_target_id": a.target_id,
            "p_payload": json.loads(a.payload), "p_amount": a.amount, "p_reason": a.reason})
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
