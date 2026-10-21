-- PowerRun Industries - Phase 2 tests. STAGING ONLY (synthetic data).
-- Run after sql/35_phase2_hardening.sql has been applied to staging:
--   POWERRUN_PROJECT_REF=<staging ref> python scripts/supabase_admin.py exec scripts/tests/phase2_staging_tests.sql
-- Returns one row per check with PASS / FAIL. Leaves only synthetic rows behind.

create temp table t (n serial, check_name text, result text);
grant all on t to anon, authenticated;
grant usage on sequence t_n_seq to anon, authenticated;

-- synthetic admin + catalogue (idempotent)
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'staging-admin@example.test', '', now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;
insert into public.admin_users (user_id, name, email, role, is_active)
select '00000000-0000-0000-0000-00000000a001', 'Staging Admin', 'staging-admin@example.test', 'admin', true
where not exists (select 1 from public.admin_users where user_id = '00000000-0000-0000-0000-00000000a001');
insert into public.categories (name, slug, is_active) values ('Test Batteries', 'test-batteries', true)
on conflict (slug) do nothing;
insert into public.products (name, slug, sku, price, mrp, stock, availability, gst_rate, price_includes_gst, hsn_code, is_active, category_id)
select 'Test LFP 51.2V 100Ah', 'test-lfp-51-2v-100ah', 'TEST-LFP-100', 10000, 10000, 5, 'in_stock', 18, true, '8507', true,
       (select id from public.categories where slug = 'test-batteries')
where not exists (select 1 from public.products where sku = 'TEST-LFP-100');

-- T1 anonymous access to private tables
set local role anon;
do $$
declare tb text; n int;
begin
  foreach tb in array array['customers','orders','order_items','leads','quotations','proforma_invoices','warranties',
                            'service_tickets','product_costs','admin_users','audit_log','coupons','dealer_enquiries'] loop
    begin
      execute format('select count(*) from public.%I', tb) into n;
      insert into t (check_name, result) values ('T1 anon cannot read ' || tb, case when n = 0 then 'PASS (0 rows visible)' else 'FAIL ' || n || ' rows' end);
    exception when insufficient_privilege then
      insert into t (check_name, result) values ('T1 anon cannot read ' || tb, 'PASS (denied)');
    end;
  end loop;
end $$;

-- rate limit: same mobile 4 times
do $$ declare i int; r text; begin
  for i in 1..4 loop
    begin perform public.submit_contact_lead(jsonb_build_object('name','Rate Test','mobile','9000000009','message','t' || i)); r := 'accepted';
    exception when others then r := 'refused'; end;
    insert into t (check_name, result) values ('S5 contact form #' || i || ' same mobile',
      case when (i < 4 and r = 'accepted') or (i = 4 and r = 'refused') then 'PASS (' || r || ')' else 'FAIL (' || r || ')' end);
  end loop;
end $$;

-- legacy order function gone: a 3-argument call now reaches the 4-argument version
do $$ begin
  insert into t (check_name, result) select 'S4 legacy create_website_order dropped',
    case when (select count(*) from pg_proc where proname = 'create_website_order') = 1 then 'PASS' else 'FAIL' end;
end $$;
reset role;

-- admin: audit trail and no rate limit
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}', true);
set local role authenticated;
update public.products set price = price + 1 where sku = 'TEST-LFP-100';
insert into t (check_name, result)
select 'audit: admin price change recorded',
       case when exists (select 1 from public.audit_log where table_name = 'products' and action = 'UPDATE'
                          and changed ? 'price' and actor = '00000000-0000-0000-0000-00000000a001') then 'PASS' else 'FAIL' end;
do $$ declare i int; ok int := 0; begin
  for i in 1..4 loop
    begin perform public.submit_contact_lead(jsonb_build_object('name','Admin Rate','mobile','9000000008','message','x')); ok := ok + 1;
    exception when others then null; end;
  end loop;
  insert into t (check_name, result) values ('S5 admin not rate limited', case when ok = 4 then 'PASS' else 'FAIL (' || ok || '/4)' end);
end $$;
reset role;

-- bucket limits and search_path
insert into t (check_name, result)
select 'S9 product-images limited to jpeg/png/webp 10 MB',
       case when allowed_mime_types = array['image/jpeg','image/png','image/webp'] and file_size_limit = 10485760 then 'PASS' else 'FAIL' end
from storage.buckets where id = 'product-images';
insert into t (check_name, result)
select 'S6 helper functions have search_path',
       case when count(*) = 2 then 'PASS' else 'FAIL' end
from pg_proc where proname in ('pr_current_fy_short','pr_freeze_issued_pi') and array_to_string(proconfig, ',') like '%search_path%';

-- website order still works for an anonymous visitor
set local role anon;
do $$ declare r jsonb; begin
  r := public.create_website_order(
         jsonb_build_object('name','Test Buyer','mobile','9000000007','address','1 Test Street','city','Agra','state','Uttar Pradesh','pincode','282001'),
         jsonb_build_array(jsonb_build_object('product_id', (select id from public.products where sku='TEST-LFP-100'), 'quantity', 1)),
         'cod', null);
  insert into t (check_name, result) values ('T15 anonymous COD order still works', 'PASS ' || coalesce(r ->> 'order_number', ''));
exception when others then
  insert into t (check_name, result) values ('T15 anonymous COD order still works', 'FAIL: ' || sqlerrm);
end $$;
reset role;

select check_name, result from t order by n;
