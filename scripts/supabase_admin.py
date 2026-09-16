#!/usr/bin/env python
"""
PowerRun Industries - Supabase administration helper.

The Supabase Personal Access Token is NEVER passed on the command line and is
never printed. It is read directly from a file outside this repository:

    %USERPROFILE%\\.powerrun\\supabase.token      (Windows)
    ~/.powerrun/supabase.token                   (macOS / Linux)

or from the SUPABASE_ACCESS_TOKEN environment variable if that is set instead.

Usage
-----
  python scripts/supabase_admin.py check
  python scripts/supabase_admin.py exec  sql/01_schema.sql
  python scripts/supabase_admin.py query "select count(*) from public.orders"
  python scripts/supabase_admin.py query-file path/to/query.sql

Every command prints only the RESULT. Revoke the token at
https://supabase.com/dashboard/account/tokens when the work is finished.
"""
import json
import os
import sys
import urllib.error
import urllib.request

PROJECT_REF = "nnkopxkyxcmtiunftlgr"
API = "https://api.supabase.com/v1"

TOKEN_PATHS = [
    os.path.join(os.path.expanduser("~"), ".powerrun", "supabase.token"),
    os.path.join(os.path.expanduser("~"), ".powerrun", "supabase.env"),
]


def load_token():
    """Read the token from disk or the environment. Never returns it to stdout."""
    env = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if env and env.strip():
        return env.strip()

    for path in TOKEN_PATHS:
        if os.path.isfile(path):
            raw = open(path, encoding="utf-8-sig").read().strip()
            if not raw:
                continue
            # Accept either a bare token or KEY=value lines.
            for line in raw.splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line and line.split("=", 1)[0].strip().isupper():
                    line = line.split("=", 1)[1].strip().strip('"').strip("'")
                if line:
                    return line

    sys.exit(
        "No Supabase access token found.\n"
        "Create it with the command shown in the setup instructions, at:\n"
        "  " + TOKEN_PATHS[0]
    )


def api_request(path, method="GET", payload=None):
    token = load_token()
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        API + path,
        data=data,
        method=method,
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            body = response.read().decode()
            return json.loads(body) if body.strip() else None
    except urllib.error.HTTPError as err:
        detail = err.read().decode(errors="replace")
        # Defensive: make sure a token can never be echoed back in an error.
        detail = detail.replace(token, "<redacted>")
        sys.exit("HTTP {} from Supabase Management API:\n{}".format(err.code, detail[:4000]))
    except urllib.error.URLError as err:
        sys.exit("Could not reach the Supabase Management API: {}".format(err.reason))


def run_sql(sql, read_only=False):
    """Execute SQL via the Management API.

    The endpoint runs statements in a READ-ONLY transaction unless read_only is
    explicitly false, which is why migrations must pass the flag.
    """
    return api_request(
        "/projects/{}/database/query".format(PROJECT_REF),
        method="POST",
        payload={"query": sql, "read_only": read_only},
    )


def run_migration(sql, name):
    """Apply DDL through the migrations endpoint.

    /database/query executes in a READ-ONLY transaction on this project, so all
    schema changes go through /database/migrations, which also records them in
    supabase_migrations.schema_migrations.
    """
    return api_request(
        "/projects/{}/database/migrations".format(PROJECT_REF),
        method="POST",
        payload={"query": sql, "name": name},
    )


def cmd_migrate(path):
    sql = open(path, encoding="utf-8").read()
    name = os.path.splitext(os.path.basename(path))[0]
    print("Applying migration {} ({} bytes)...".format(name, len(sql)))
    run_migration(sql, name)
    print("Applied:", name)


def cmd_check():
    project = api_request("/projects/{}".format(PROJECT_REF))
    print("Project   :", project.get("name"))
    print("Ref       :", project.get("id"))
    print("Region    :", project.get("region"))
    print("Status    :", project.get("status"))
    rows = run_sql("select current_database() as db, version() as version")
    print("Database  :", rows[0]["db"])
    print("Postgres  :", rows[0]["version"].split(",")[0])
    print("\nToken works. It was not printed and is not stored in this repository.")


def cmd_exec(path):
    sql = open(path, encoding="utf-8").read()
    print("Running {} ({} bytes)…".format(path, len(sql)))
    result = run_sql(sql)
    print("OK.", "Rows returned:", len(result) if isinstance(result, list) else 0)
    if isinstance(result, list) and result:
        print(json.dumps(result[:20], indent=2, default=str))


def cmd_query(sql):
    result = run_sql(sql)
    print(json.dumps(result, indent=2, default=str))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    command = sys.argv[1]

    if command == "check":
        cmd_check()
    elif command == "exec":
        cmd_exec(sys.argv[2])
    elif command == "migrate":
        cmd_migrate(sys.argv[2])
    elif command == "query":
        cmd_query(sys.argv[2])
    elif command == "query-file":
        cmd_query(open(sys.argv[2], encoding="utf-8").read())
    else:
        sys.exit("Unknown command: " + command)


if __name__ == "__main__":
    main()
