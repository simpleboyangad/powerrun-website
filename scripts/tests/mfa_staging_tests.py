#!/usr/bin/env python
"""
PowerRun Industries - migration 47 (admin 2-step login) tests. STAGING ONLY.

    POWERRUN_PROJECT_REF=<staging ref> python scripts/tests/mfa_staging_tests.py

Everything runs in one transaction that is always rolled back (a fake verified
authenticator is inserted for the owner, then the session is simulated at aal1
and aal2 through request.jwt.claims).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import supabase_admin as sa  # noqa: E402

if sa.PROJECT_REF == "nnkopxkyxcmtiunftlgr":
    sys.exit("Refusing to run against production.")

SQL = r"""
do $t$
declare
  owner uuid := (select user_id from admin_users where role = 'owner' and is_active limit 1);
  agent uuid := (select user_id from admin_users where role like 'agent\_%' and is_active limit 1);
  total_orders bigint := (select count(*) from orders);
  own_orders bigint;
  out jsonb := '{}';
begin
  -- simulate a session: sub + aal, as the authenticated role
  create temp table _r (k text, v text) on commit drop;
  grant all on _r to authenticated;

  -- 1. owner, no authenticator yet, password only (aal1): still allowed
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  insert into _r values ('no_factor_aal1_is_admin', public.is_admin()::text),
                        ('no_factor_aal1_is_owner', public.is_owner()::text),
                        ('no_factor_aal1_role', coalesce(public.pr_my_role(), 'null'));
  reset role;

  -- owner links an authenticator
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
  values (gen_random_uuid(), owner, 'test-47', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP');

  -- 2. password only (aal1): refused everywhere
  set local role authenticated;
  insert into _r values ('factor_aal1_is_admin', public.is_admin()::text),
                        ('factor_aal1_is_owner', public.is_owner()::text),
                        ('factor_aal1_role', coalesce(public.pr_my_role(), 'null')),
                        ('factor_aal1_orders_visible', (select count(*) from orders)::text);
  reset role;

  -- 3. passed the code step (aal2): allowed
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  insert into _r values ('factor_aal2_is_admin', public.is_admin()::text),
                        ('factor_aal2_is_owner', public.is_owner()::text),
                        ('factor_aal2_role', coalesce(public.pr_my_role(), 'null')),
                        ('factor_aal2_orders_visible', (select count(*) from orders)::text);
  reset role;

  -- 4. AI agent login (no authenticator, aal1): unchanged
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  insert into _r values ('agent_is_agent', public.is_agent()::text),
                        ('agent_is_admin', public.is_admin()::text),
                        ('agent_role', coalesce(public.pr_my_role(), 'null')),
                        ('agent_orders_visible', (select count(*) from orders)::text);
  reset role;

  select jsonb_object_agg(k, v) into out from _r;
  -- a customer may always read their own orders (orders_owner_read)
  own_orders := (select count(*) from orders where user_id = owner);
  out := out || jsonb_build_object('total_orders', total_orders::text, 'own_orders', own_orders::text);
  raise exception 'RESULT %', out;   -- always roll back
end;
$t$;
"""

try:
    sa.run_sql(SQL)
    sys.exit("expected the rollback exception")
except SystemExit as e:
    msg = str(e)
    if "RESULT" not in msg:
        sys.exit(msg)
    blob = msg[msg.index("RESULT") + 7:]
    r = json.loads(blob[:blob.index("}") + 1].replace('\\"', '"'))

total = r["total_orders"]
checks = [
    ("no authenticator, aal1: is_admin", r["no_factor_aal1_is_admin"] == "true"),
    ("no authenticator, aal1: is_owner", r["no_factor_aal1_is_owner"] == "true"),
    ("no authenticator, aal1: role owner", r["no_factor_aal1_role"] == "owner"),
    ("authenticator, aal1: is_admin refused", r["factor_aal1_is_admin"] == "false"),
    ("authenticator, aal1: is_owner refused", r["factor_aal1_is_owner"] == "false"),
    ("authenticator, aal1: no role", r["factor_aal1_role"] == "null"),
    ("authenticator, aal1: only own customer orders", r["factor_aal1_orders_visible"] == r["own_orders"]),
    ("authenticator, aal2: is_admin", r["factor_aal2_is_admin"] == "true"),
    ("authenticator, aal2: is_owner", r["factor_aal2_is_owner"] == "true"),
    ("authenticator, aal2: role owner", r["factor_aal2_role"] == "owner"),
    ("authenticator, aal2: all orders", r["factor_aal2_orders_visible"] == total),
    ("agent: is_agent", r["agent_is_agent"] == "true"),
    ("agent: not admin", r["agent_is_admin"] == "false"),
    ("agent: role kept", r["agent_role"].startswith("agent_")),
    ("agent: orders readable", r["agent_orders_visible"] == total),
]
for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
print(json.dumps(r))
left = sa.run_sql("select count(*) n from auth.mfa_factors where friendly_name = 'test-47'")[0]["n"]
print("PASS test factor rolled back" if left == 0 else "FAIL test factor left behind")
sys.exit(0 if all(ok for _, ok in checks) and left == 0 else 1)
