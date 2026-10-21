#!/usr/bin/env python
"""
PowerRun Industries - compare the database structure of two projects (read-only).

    python scripts/schema_compare.py <project-ref-A> <project-ref-B>

Compares columns (name, type, default, not null), constraints, indexes, policies,
function definitions (hashed), triggers, table grants, function execute grants and
storage buckets. Prints only the differences. No data is read.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import supabase_admin as sa  # noqa: E402

QUERIES = {
    "columns": """select c.relname||'.'||a.attname||' '||format_type(a.atttypid,a.atttypmod)||' nn='||a.attnotnull||' def='||coalesce(pg_get_expr(d.adbin,d.adrelid),'') k
        from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
        left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname='public' and c.relkind='r'""",
    "constraints": """select c.relname||' '||pg_get_constraintdef(k.oid) k from pg_constraint k join pg_class c on c.oid=k.conrelid
        join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'""",
    "indexes": "select indexdef k from pg_indexes where schemaname='public'",
    "policies": """select schemaname||'.'||tablename||' '||policyname||' '||cmd||' '||roles::text||' '||coalesce(qual,'')||' '||coalesce(with_check,'') k
        from pg_policies where schemaname in ('public','storage')""",
    "functions": """select p.proname||'('||pg_get_function_identity_arguments(p.oid)||') '||md5(replace(pg_get_functiondef(p.oid), chr(13), '')) k
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'""",
    "triggers": """select pg_get_triggerdef(t.oid) k from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
        where n.nspname in ('public','auth') and not t.tgisinternal and (n.nspname='public' or t.tgname='on_auth_user_created')""",
    "table_grants": """select c.relname||' '||r.role||' '||p.priv k from pg_class c join pg_namespace n on n.oid=c.relnamespace
        cross join (values ('anon'),('authenticated')) r(role) cross join (values ('select'),('insert'),('update'),('delete')) p(priv)
        where n.nspname='public' and c.relkind='r' and has_table_privilege(r.role, c.oid, p.priv)""",
    "function_grants": """select p.proname||'('||pg_get_function_identity_arguments(p.oid)||') anon='||has_function_privilege('anon',p.oid,'execute')||' auth='||has_function_privilege('authenticated',p.oid,'execute') k
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'""",
    "rls": """select c.relname||' rls='||c.relrowsecurity k from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r'""",
    "buckets": "select id||' public='||public||' size='||coalesce(file_size_limit::text,'')||' mime='||coalesce(allowed_mime_types::text,'') k from storage.buckets",
}


def snapshot(ref):
    sa.PROJECT_REF = ref
    sql = " union all ".join("select %s as s, k from (%s) x" % ("'" + name + "'", q) for name, q in QUERIES.items())
    rows = sa.run_sql(sql, read_only=True) or []
    out = {}
    for r in rows:
        out.setdefault(r["s"], set()).add(r["k"])
    return out


def main(a, b):
    A, B = snapshot(a), snapshot(b)
    total = 0
    for name in QUERIES:
        only_a, only_b = A.get(name, set()) - B.get(name, set()), B.get(name, set()) - A.get(name, set())
        print("%-16s %4d vs %4d  %s" % (name, len(A.get(name, ())), len(B.get(name, ())),
                                         "same" if not (only_a or only_b) else "DIFFERENT"))
        for x in sorted(only_a)[:10]:
            print("    only in A:", x[:200])
        for x in sorted(only_b)[:10]:
            print("    only in B:", x[:200])
        total += len(only_a) + len(only_b)
    print("differences:", total)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
