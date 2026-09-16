#!/usr/bin/env python
"""
PowerRun Industries - run SQL directly against Postgres.

The Supabase Management API's /database/query endpoint executes statements in a
READ-ONLY transaction and /database/migrations is not permitted by the current
token, so migrations run over a normal Postgres connection instead.

Credentials
-----------
The database password is read from, in order:
    %USERPROFILE%\\.powerrun\\supabase.db.token
    the PGPASSWORD environment variable
It is NEVER printed, logged, or written into this repository. The host, port,
user and database name come from the Management API at run time.

Usage
-----
  python scripts/pg_exec.py ping
  python scripts/pg_exec.py exec sql/RUN_ALL.sql
  python scripts/pg_exec.py query "select count(*) from public.orders"
  python scripts/pg_exec.py query-file path/to/query.sql
"""
import json
import os
import re
import ssl
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import supabase_admin as sa  # noqa: E402

try:
    import pg8000.dbapi
except ImportError:
    sys.exit("pg8000 is not installed. Run:\n"
             "  python -m pip install --user --trusted-host pypi.org "
             "--trusted-host files.pythonhosted.org pg8000")

PASSWORD_PATHS = [
    os.path.join(os.path.expanduser("~"), ".powerrun", "supabase.db.token"),
    os.path.join(os.path.expanduser("~"), ".powerrun", "supabase.db.password"),
]


def db_password():
    env = os.environ.get("PGPASSWORD")
    if env and env.strip():
        return env.strip()
    for path in PASSWORD_PATHS:
        if os.path.isfile(path):
            raw = open(path, encoding="utf-8-sig").read().strip()
            for line in raw.splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line and line.split("=", 1)[0].strip().isupper():
                    line = line.split("=", 1)[1].strip().strip('"').strip("'")
                if line:
                    return line
    sys.exit("No database password found. Expected it at:\n  " + PASSWORD_PATHS[0])


def endpoints():
    """Candidate host/port/user combinations, most capable first.

    Port 5432 is a session-mode connection, which is the right choice for DDL.
    Port 6543 is the transaction pooler and is used only as a fallback.
    """
    cfg = sa.api_request("/projects/{}/config/database/pgbouncer".format(sa.PROJECT_REF))
    dsn = (cfg or {}).get("connection_string") or ""
    match = re.match(r"^postgres(?:ql)?://(?P<user>[^:]+):[^@]+@(?P<host>[^:/]+):(?P<port>\d+)/(?P<db>[^?]+)", dsn)
    if not match:
        sys.exit("Could not determine the database host from the Management API.")
    g = match.groupdict()
    return [
        {"host": g["host"], "port": 5432, "user": g["user"], "db": g["db"]},
        {"host": g["host"], "port": int(g["port"]), "user": g["user"], "db": g["db"]},
    ]


_conn_info = {}


def connect():
    password = db_password()
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE  # Supabase presents a cert for a different SAN

    last = None
    targets = [_conn_info["ok"]] if "ok" in _conn_info else endpoints()
    for target in targets:
        try:
            conn = pg8000.dbapi.connect(
                user=target["user"], password=password, host=target["host"],
                port=target["port"], database=target["db"], ssl_context=ctx, timeout=120,
            )
            _conn_info["ok"] = target
            return conn
        except Exception as err:      # noqa: BLE001 - try the next endpoint
            last = "{}:{} -> {}".format(target["host"], target["port"], err)
    sys.exit("Could not connect to Postgres.\nLast error: {}".format(last))


# --------------------------------------------------------------------------
# Statement splitting
#
# pg8000 speaks the extended query protocol, which allows only ONE statement per
# execute(). The migration contains dollar-quoted DO blocks and function bodies,
# so splitting on ';' naively would corrupt them. This tracks line comments,
# block comments, single-quoted strings and $tag$ ... $tag$ blocks.
# --------------------------------------------------------------------------
def split_statements(sql):
    statements, buffer = [], []
    i, n = 0, len(sql)
    in_line_comment = in_block_comment = in_single = False
    dollar_tag = None

    while i < n:
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < n else ""

        if in_line_comment:
            buffer.append(ch)
            if ch == "\n":
                in_line_comment = False
        elif in_block_comment:
            buffer.append(ch)
            if ch == "*" and nxt == "/":
                buffer.append(nxt); i += 1
                in_block_comment = False
        elif in_single:
            buffer.append(ch)
            if ch == "'":
                if nxt == "'":          # escaped quote
                    buffer.append(nxt); i += 1
                else:
                    in_single = False
        elif dollar_tag:
            buffer.append(ch)
            if ch == "$" and sql.startswith(dollar_tag, i):
                buffer.append(sql[i + 1:i + len(dollar_tag)])
                i += len(dollar_tag) - 1
                dollar_tag = None
        else:
            if ch == "-" and nxt == "-":
                in_line_comment = True; buffer.append(ch)
            elif ch == "/" and nxt == "*":
                in_block_comment = True; buffer.append(ch)
            elif ch == "'":
                in_single = True; buffer.append(ch)
            elif ch == "$":
                tag = re.match(r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$", sql[i:])
                if tag:
                    dollar_tag = tag.group(0)
                    buffer.append(dollar_tag)
                    i += len(dollar_tag) - 1
                else:
                    buffer.append(ch)
            elif ch == ";":
                statement = "".join(buffer).strip()
                if statement:
                    statements.append(statement)
                buffer = []
            else:
                buffer.append(ch)
        i += 1

    tail = "".join(buffer).strip()
    if tail:
        statements.append(tail)
    return [s for s in statements if not re.match(r"^(--|/\*)", s) or re.search(r"[A-Za-z]", re.sub(r"--[^\n]*", "", s))]


def summarise(statement):
    text = re.sub(r"--[^\n]*", " ", statement)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:100]


def run_script(path, stop_on_error=True):
    sql = open(path, encoding="utf-8").read()
    statements = split_statements(sql)
    print("{}: {} statements".format(path, len(statements)))

    conn = connect()
    conn.autocommit = False
    cursor = conn.cursor()
    executed, failures = 0, []

    try:
        for index, statement in enumerate(statements, start=1):
            try:
                cursor.execute(statement)
                executed += 1
            except Exception as err:      # noqa: BLE001
                failures.append((index, summarise(statement), str(err)))
                if stop_on_error:
                    conn.rollback()
                    print("\nFAILED at statement {}:\n  {}\n  {}".format(index, summarise(statement), err))
                    print("\nTransaction rolled back. No changes were applied.")
                    return False
        conn.commit()
    finally:
        cursor.close()
        conn.close()

    print("Applied {} statements. Committed.".format(executed))
    for index, text, err in failures:
        print("  warn stmt {}: {} -> {}".format(index, text, err))
    return True


def run_query(sql):
    conn = connect()
    conn.autocommit = True
    cursor = conn.cursor()
    try:
        cursor.execute(sql)
        if cursor.description is None:
            return []
        columns = [d[0] for d in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    finally:
        cursor.close()
        conn.close()


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    command = sys.argv[1]

    if command == "ping":
        rows = run_query("select version() as v, current_user as u, current_database() as d")
        target = _conn_info.get("ok", {})
        print("Connected : {}:{}".format(target.get("host"), target.get("port")))
        print("User      :", rows[0]["u"])
        print("Database  :", rows[0]["d"])
        print("Server    :", rows[0]["v"].split(",")[0])
        print("Password  : <read from file, not shown>")

    elif command == "exec":
        ok = run_script(sys.argv[2])
        sys.exit(0 if ok else 1)

    elif command == "query":
        print(json.dumps(run_query(sys.argv[2]), indent=2, default=str))

    elif command == "query-file":
        print(json.dumps(run_query(open(sys.argv[2], encoding="utf-8").read()), indent=2, default=str))

    elif command == "split":       # dry run: show how the file will be split
        statements = split_statements(open(sys.argv[2], encoding="utf-8").read())
        print("{} statements".format(len(statements)))
        for index, statement in enumerate(statements, start=1):
            print("{:>4}  {}".format(index, summarise(statement)))

    else:
        sys.exit("Unknown command: " + command)


if __name__ == "__main__":
    main()
