#!/usr/bin/env python
"""
PowerRun Industries - encrypted daily backup of the Supabase database (data).

    python scripts/backup_db.py                      back up into the default folder
    python scripts/backup_db.py --out "D:\\Backups"   another folder
    python scripts/backup_db.py --verify FILE        decrypt in memory and print row counts

What is saved: every row of every table in the public schema (read through the REST
API with the service key, page by page) plus the login users (id, email, phone,
dates, metadata - never passwords, which Supabase does not expose). The table
structure lives in sql/ in this repository. Product photos live in Storage and are
not part of this file.

The JSON is gzip-compressed and encrypted with scripts/backup_crypt.ps1 (AES-256 +
HMAC, Windows built-in). Key: %USERPROFILE%\\.powerrun\\backup.key, created on the
first run - keep a copy somewhere other than this PC. Files older than 30 days in
the output folder are removed.

Service key: taken through pr_data.py while the Management API token file exists,
and then kept for unattended runs in %USERPROFILE%\\.powerrun\\backup-service.dpapi,
encrypted with Windows DPAPI (only this Windows user on this PC can read it).
Nothing secret or personal is printed.
"""
import datetime
import gzip
import io
import json
import os
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

HOME = os.path.join(os.path.expanduser("~"), ".powerrun")
KEY_FILE = os.path.join(HOME, "backup.key")
DPAPI_FILE = os.path.join(HOME, "backup-service.dpapi")
DEFAULT_OUT = os.environ.get("POWERRUN_BACKUP_DIR") or r"G:\My Drive\PowerRun Backups"
KEEP_DAYS = 30
CRYPT = os.path.join(HERE, "backup_crypt.ps1")
PAGE = 1000


def ps(script, stdin=None):
    r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
                       input=stdin, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip().splitlines()[-1] if r.stderr.strip() else "PowerShell failed")
    return r.stdout.strip()


def remember_key(key):
    os.makedirs(HOME, exist_ok=True)
    blob = ps("$s = [Console]::In.ReadToEnd().Trim() | ConvertTo-SecureString -AsPlainText -Force; "
              "$s | ConvertFrom-SecureString", stdin=key)
    with open(DPAPI_FILE, "w", encoding="ascii") as f:
        f.write(blob)


def recall_key():
    if not os.path.isfile(DPAPI_FILE):
        return None
    return ps("$s = Get-Content -Raw '%s' | ConvertTo-SecureString; "
              "[System.Net.NetworkCredential]::new('', $s).Password" % DPAPI_FILE.replace("'", "''"))


def service_key():
    token = os.path.join(HOME, "supabase.token")
    if os.path.isfile(token) and os.path.getsize(token) > 0:
        import pr_data
        key = pr_data.service_key()
        remember_key(key)
        return key
    key = recall_key()
    if not key:
        sys.exit("No service key: save the Supabase token (supabase.token) once and run again.")
    return key


def base_url():
    import pr_data
    return pr_data.BASE


def get(url, key, headers=None):
    req = urllib.request.Request(url, headers=dict({"apikey": key, "Authorization": "Bearer " + key}, **(headers or {})))
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8")), r.headers


def table_names(base, key):
    spec, _ = get(base + "/rest/v1/", key, {"Accept": "application/openapi+json"})
    return sorted(p.strip("/") for p in spec.get("paths", {}) if p.count("/") == 1 and p != "/"
                  and not p.startswith("/rpc"))


def dump_table(base, key, table):
    rows, start = [], 0
    while True:
        chunk, _ = get(base + "/rest/v1/" + urllib.parse.quote(table) + "?select=*",
                       key, {"Range-Unit": "items", "Range": "%d-%d" % (start, start + PAGE - 1)})
        rows.extend(chunk)
        if len(chunk) < PAGE:
            return rows
        start += PAGE


def dump_users(base, key):
    users, page = [], 1
    keep = ("id", "email", "phone", "created_at", "last_sign_in_at", "email_confirmed_at",
            "user_metadata", "app_metadata")
    while True:
        data, _ = get(base + "/auth/v1/admin/users?per_page=1000&page=%d" % page, key)
        batch = data.get("users", []) if isinstance(data, dict) else data
        users.extend({k: u.get(k) for k in keep} for u in batch)
        if len(batch) < 1000:
            return users
        page += 1


def crypt(mode, src, dst):
    out = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", CRYPT,
                          "-Mode", mode, "-In", src, "-Out", dst, "-KeyFile", KEY_FILE],
                         capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip() or out.stdout.strip())


def ensure_key():
    os.makedirs(HOME, exist_ok=True)
    if not os.path.isfile(KEY_FILE):
        subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", CRYPT,
                        "-Mode", "NewKey", "-KeyFile", KEY_FILE], check=True, capture_output=True)
        print("NEW backup key created at %s - keep a copy outside this PC." % KEY_FILE)


def backup(out_dir):
    ensure_key()
    key = service_key()
    base = base_url()
    data = {"created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "project": base.split("//")[1].split(".")[0], "tables": {}, "auth_users": []}
    for t in table_names(base, key):
        data["tables"][t] = dump_table(base, key, t)
    data["auth_users"] = dump_users(base, key)

    raw = gzip.compress(json.dumps(data, default=str).encode("utf-8"))
    os.makedirs(out_dir, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y-%m-%d_%H%M")
    target = os.path.join(out_dir, "powerrun-db-%s.prb" % stamp)
    fd, tmp = tempfile.mkstemp(suffix=".json.gz")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
        crypt("Encrypt", tmp, target)
    finally:
        os.remove(tmp)

    cutoff = datetime.datetime.now() - datetime.timedelta(days=KEEP_DAYS)
    removed = 0
    for name in os.listdir(out_dir):
        path = os.path.join(out_dir, name)
        if name.startswith("powerrun-db-") and name.endswith(".prb") and \
                datetime.datetime.fromtimestamp(os.path.getmtime(path)) < cutoff:
            os.remove(path)
            removed += 1
    counts = {t: len(r) for t, r in data["tables"].items()}
    print("backup ok: %s (%d KB), %d tables, %d rows, %d users, %d old files removed"
          % (os.path.basename(target), os.path.getsize(target) // 1024, len(counts),
             sum(counts.values()), len(data["auth_users"]), removed))
    return target


def verify(path):
    fd, tmp = tempfile.mkstemp(suffix=".json.gz")
    os.close(fd)
    try:
        crypt("Decrypt", path, tmp)
        with open(tmp, "rb") as f:
            data = json.loads(gzip.decompress(f.read()).decode("utf-8"))
    finally:
        os.remove(tmp)
    counts = {t: len(r) for t, r in data["tables"].items()}
    print("verify ok: created %s, %d tables, %d rows, %d users"
          % (data["created_at"], len(counts), sum(counts.values()), len(data["auth_users"])))
    for t in sorted(counts):
        print("  %-28s %d" % (t, counts[t]))


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--log" in args:
        # unattended runs (Windows Task Scheduler): append everything to a log file
        log = open(args[args.index("--log") + 1], "a", encoding="utf-8")
        sys.stdout = sys.stderr = log
        print("==== %s" % datetime.datetime.now().isoformat(timespec="seconds"))
    if args[:1] == ["--verify"]:
        verify(args[1])
    else:
        out = args[args.index("--out") + 1] if "--out" in args else DEFAULT_OUT
        backup(out)
