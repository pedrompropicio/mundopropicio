DO $$ DECLARE e record; actual jsonb; aid uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; BEGIN
 FOR e IN SELECT * FROM expected LOOP
 UPDATE meta_custom_audiences SET filters=e.filter;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY email,phone),'[]') INTO actual FROM crm_meta_audience_collect_leads(aid) r;
 IF actual IS DISTINCT FROM e.result THEN RAISE EXCEPTION 'legacy filter regression %',e.filter; END IF;
 END LOOP;
 UPDATE meta_custom_audiences SET filters='{"source":"coala_list:eb2027","replace":true}';
 PERFORM set_config('test.uid','',false); PERFORM set_config('request.jwt.claims','{"role":"service_role"}',false);
 SELECT jsonb_agg(to_jsonb(r) ORDER BY email) INTO actual FROM crm_meta_audience_collect_leads(aid) r;
 IF actual <> '[{"email":"fallback@test.invalid","phone":"351222"},{"email":"yes@test.invalid","phone":"351111"}]'::jsonb THEN RAISE EXCEPTION 'eligibility failure %',actual; END IF;
 INSERT INTO coala_list_consents(company_id,email,marketing_opt_in,created_at) VALUES ('7d831e59-6e82-427b-95a0-64904aae5dd2','yes@test.invalid',false,now()+interval '1 second');
 IF (SELECT count(*) FROM crm_meta_audience_collect_leads(aid))<>1 THEN RAISE EXCEPTION 'withdrawal retained'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',false);
 BEGIN PERFORM * FROM crm_meta_audience_collect_leads(aid); RAISE EXCEPTION 'auth accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'unauthenticated' THEN RAISE; END IF; END;
 PERFORM set_config('test.uid','11111111-1111-1111-1111-111111111111',false); PERFORM set_config('test.company','22222222-2222-2222-2222-222222222222',false);
 BEGIN PERFORM * FROM crm_meta_audience_collect_leads(aid); RAISE EXCEPTION 'tenant accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'forbidden' THEN RAISE; END IF; END;
 IF has_function_privilege('anon','crm_meta_audience_collect_leads(uuid)','EXECUTE') THEN RAISE EXCEPTION 'anon execute'; END IF;
 IF NOT has_function_privilege('service_role','crm_meta_audience_collect_leads(uuid)','EXECUTE') THEN RAISE EXCEPTION 'service missing'; END IF;
 RAISE NOTICE '9 legacy filters + eligibility/withdrawal/service/auth/tenant/ACL passed';
END $$;
