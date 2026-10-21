#!/usr/bin/env python
"""
PowerRun Industries - write the database structure as one SQL file.

    python scripts/schema_snapshot.py                    -> sql/00_baseline_schema.sql
    python scripts/schema_snapshot.py --out FILE

The first tables were created in the Supabase dashboard, so the migrations in sql/
cannot rebuild the database on their own. This reads the live catalog (read-only
transaction through the Management API) and writes everything needed to recreate
the public schema on an empty Supabase project: types, sequences, tables, keys,
indexes, functions, row level security policies, triggers, grants, storage buckets
and their policies, the auth sign-up trigger and pg_cron jobs. No data, no secrets.

Set POWERRUN_PROJECT_REF to read another project (default: production).
"""
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import supabase_admin as sa  # noqa: E402


def q(sql):
    return sa.run_sql(sql, read_only=True) or []


def ident(name):
    return '"%s"' % name.replace('"', '""')


def lit(text):
    return "'" + str(text).replace("'", "''") + "'"


def build():
    out = ["-- PowerRun Industries - baseline schema of project %s" % sa.PROJECT_REF,
           "-- Generated %s by scripts/schema_snapshot.py (read-only). Structure only, no data."
           % datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
           "-- Apply to an EMPTY Supabase project, then the later numbered migrations are already included.",
           "set check_function_bodies = off;", ""]

    # extensions
    for e in q("""select extname from pg_extension
                  where extname not in ('plpgsql','pg_graphql','pg_stat_statements','supabase_vault','pgsodium','pgjwt')
                  order by 1"""):
        schema = "pg_catalog" if e["extname"] == "pg_cron" else "extensions"
        out.append("create extension if not exists %s with schema %s;" % (ident(e["extname"]), schema))
    out.append("")

    # enum types
    for t in q("""select t.typname, array_agg(e.enumlabel order by e.enumsortorder) labels
                  from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace
                  where n.nspname='public' group by 1 order by 1"""):
        out.append("create type public.%s as enum (%s);" % (ident(t["typname"]), ", ".join(lit(x) for x in t["labels"])))

    # sequences (not identity-owned)
    for s in q("""select s.sequencename, s.start_value, s.increment_by, s.last_value
                  from pg_sequences s where s.schemaname='public'
                  and not exists (select 1 from pg_depend d join pg_class c on c.oid=d.objid
                                  where c.relname=s.sequencename and d.deptype='i')
                  order by 1"""):
        out.append("create sequence if not exists public.%s start %s increment %s;"
                   % (ident(s["sequencename"]), s["start_value"], s["increment_by"]))
    out.append("")

    # tables and columns
    cols = q("""select c.relname tbl, a.attname col, format_type(a.atttypid, a.atttypmod) typ, a.attnotnull nn,
                       pg_get_expr(d.adbin, d.adrelid) def, a.attidentity ident, a.attgenerated gen
                from pg_class c join pg_namespace n on n.oid=c.relnamespace
                join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
                left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
                where n.nspname='public' and c.relkind='r' order by c.relname, a.attnum""")
    tables = {}
    for c in cols:
        tables.setdefault(c["tbl"], []).append(c)
    for tbl, cs in tables.items():
        lines = []
        for c in cs:
            line = "  %s %s" % (ident(c["col"]), c["typ"])
            if c["ident"] in ("a", "d"):
                line += " generated %s as identity" % ("always" if c["ident"] == "a" else "by default")
            elif c["gen"] == "s":
                line += " generated always as (%s) stored" % c["def"]
            elif c["def"] is not None:
                line += " default %s" % c["def"]
            if c["nn"]:
                line += " not null"
            lines.append(line)
        out.append("create table public.%s (\n%s\n);" % (ident(tbl), ",\n".join(lines)))
    out.append("")

    # constraints: primary/unique/check first, foreign keys last
    cons = q("""select c.relname tbl, k.conname, k.contype, pg_get_constraintdef(k.oid) def
                from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and k.contype in ('p','u','c','f','x')
                order by case k.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 when 'x' then 3 else 4 end, 1, 2""")
    for k in cons:
        out.append("alter table public.%s add constraint %s %s;" % (ident(k["tbl"]), ident(k["conname"]), k["def"]))
    out.append("")

    # indexes not created by constraints
    for i in q("""select indexdef from pg_indexes i where schemaname='public'
                  and not exists (select 1 from pg_constraint k where k.conname=i.indexname)
                  order by tablename, indexname"""):
        out.append(i["indexdef"] + ";")
    out.append("")

    # functions
    for f in q("""select pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.prokind in ('f','p') order by p.proname, p.oid"""):
        out.append(f["def"].rstrip() + ";\n")

    # row level security + policies
    for t in q("""select c.relname, c.relrowsecurity rls, c.relforcerowsecurity f from pg_class c
                  join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1"""):
        if t["rls"]:
            out.append("alter table public.%s enable row level security;" % ident(t["relname"]))
    for p in q("""select tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies
                  where schemaname='public' order by tablename, policyname"""):
        roles = p["roles"] if isinstance(p["roles"], list) else str(p["roles"]).strip("{}").split(",")
        stmt = "create policy %s on public.%s as %s for %s to %s" % (
            ident(p["policyname"]), ident(p["tablename"]), p["permissive"].lower(), p["cmd"].lower(),
            ", ".join(r if r == "public" else ident(r) for r in roles))
        if p["qual"]:
            stmt += " using (%s)" % p["qual"]
        if p["with_check"]:
            stmt += " with check (%s)" % p["with_check"]
        out.append(stmt + ";")
    out.append("")

    # triggers (public tables, and auth.users -> public functions)
    for t in q("""select pg_get_triggerdef(t.oid) def from pg_trigger t join pg_class c on c.oid=t.tgrelid
                  join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname in ('public','auth') and not t.tgisinternal
                  and (n.nspname='public' or t.tgfoid in (select p.oid from pg_proc p join pg_namespace pn on pn.oid=p.pronamespace where pn.nspname='public'))
                  order by 1"""):
        out.append(t["def"] + ";")
    out.append("")

    # table grants for the API roles
    out.append("-- grants: start from nothing, then grant exactly what production has")
    for tbl in tables:
        out.append("revoke all on public.%s from anon, authenticated;" % ident(tbl))
    # information_schema only lists grants the reading role can see, so ask has_table_privilege()
    for g in q("""select c.relname table_name, r.role grantee, string_agg(p.priv, ', ' order by p.priv) privs
                  from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  cross join (values ('anon'),('authenticated')) r(role)
                  cross join (values ('select'),('insert'),('update'),('delete'),('truncate'),('references'),('trigger')) p(priv)
                  where n.nspname='public' and c.relkind='r' and has_table_privilege(r.role, c.oid, p.priv)
                  group by 1,2 order by 1,2"""):
        out.append("grant %s on public.%s to %s;" % (g["privs"], ident(g["table_name"]), g["grantee"]))
    for tbl in tables:
        out.append("grant all on public.%s to service_role;" % ident(tbl))
    for s in q("""select sequence_name from information_schema.sequences where sequence_schema='public' order by 1"""):
        out.append("grant usage, select on sequence public.%s to authenticated, service_role;" % ident(s["sequence_name"]))
    # function execute grants
    for f in q("""select p.proname, pg_get_function_identity_arguments(p.oid) args,
                         has_function_privilege('anon', p.oid, 'execute') a,
                         has_function_privilege('authenticated', p.oid, 'execute') au
                  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.prokind='f' order by 1, 2"""):
        sig = "public.%s(%s)" % (ident(f["proname"]), f["args"])
        out.append("revoke execute on function %s from public, anon, authenticated;" % sig)
        to = [r for r, ok in (("anon", f["a"]), ("authenticated", f["au"])) if ok]
        if to:
            out.append("grant execute on function %s to %s;" % (sig, ", ".join(to)))
    out.append("")

    # storage buckets and policies
    for b in q("select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by 1"):
        mimes = b["allowed_mime_types"]
        mimes = ("array[%s]" % ", ".join(lit(m) for m in mimes)) if mimes else "null"
        out.append("insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values "
                   "(%s, %s, %s, %s, %s) on conflict (id) do nothing;"
                   % (lit(b["id"]), lit(b["name"]), str(b["public"]).lower(),
                      b["file_size_limit"] if b["file_size_limit"] is not None else "null", mimes))
    for p in q("""select policyname, permissive, roles, cmd, qual, with_check from pg_policies
                  where schemaname='storage' and tablename='objects' order by policyname"""):
        roles = p["roles"] if isinstance(p["roles"], list) else str(p["roles"]).strip("{}").split(",")
        stmt = "create policy %s on storage.objects as %s for %s to %s" % (
            ident(p["policyname"]), p["permissive"].lower(), p["cmd"].lower(),
            ", ".join(r if r == "public" else ident(r) for r in roles))
        if p["qual"]:
            stmt += " using (%s)" % p["qual"]
        if p["with_check"]:
            stmt += " with check (%s)" % p["with_check"]
        out.append(stmt + ";")
    out.append("")

    # scheduled jobs
    try:
        jobs = q("select jobname, schedule, command from cron.job order by jobname")
    except SystemExit:
        jobs = []
    for j in jobs:
        out.append("select cron.schedule(%s, %s, %s);" % (lit(j["jobname"]), lit(j["schedule"]), lit(j["command"])))
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    args = sys.argv[1:]
    target = args[args.index("--out") + 1] if "--out" in args else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sql", "00_baseline_schema.sql")
    sql = build()
    with open(target, "w", encoding="utf-8", newline="\n") as f:
        f.write(sql)
    print("wrote %s (%d lines)" % (target, sql.count("\n")))
