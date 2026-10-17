\set ON_ERROR_STOP 1
-- MP identity is a fixed synthetic company only, no Live members ever used.
INSERT INTO companies(id,name) VALUES('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','Fixture MP');
INSERT INTO portal_sites(id,company_id,brand_key,domain) VALUES('33333333-0000-4000-8000-000000000001','7c858982-6ccd-47ca-bd65-e0dd3eebf01c','newgang','fixture.invalid');
INSERT INTO club_members(id,site_id,company_id,email,first_name,referral_code,confirmed_at,member_no,source)
 VALUES('33333333-0000-4000-8000-000000000002','33333333-0000-4000-8000-000000000001','7c858982-6ccd-47ca-bd65-e0dd3eebf01c','member@example.invalid','Fixture','F332',now(),1,'formulario');
INSERT INTO club_member_sessions(site_id,member_id,token_hash,expires_at) VALUES('33333333-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000002','fixture-session',now()+interval '1 day');
INSERT INTO club_member_profiles(member_id,site_id,company_id,birth_date) VALUES('33333333-0000-4000-8000-000000000002','33333333-0000-4000-8000-000000000001','7c858982-6ccd-47ca-bd65-e0dd3eebf01c','2000-01-01');
CREATE FUNCTION t.pref(j jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT club_profile_preferences('33333333-0000-4000-8000-000000000001','fixture-session',
 CASE WHEN j ? 'expected_dates' THEN j ELSE j||jsonb_build_object('expected_dates',
 CASE WHEN j->>'channel'='email' THEN jsonb_build_object('email',club_consent_state('33333333-0000-4000-8000-000000000001','fixture-session')#>'{email,date}')
 ELSE (SELECT jsonb_object_agg(key,value->'date') FROM jsonb_each(club_consent_state('33333333-0000-4000-8000-000000000001','fixture-session')->'ads')) END) END) $$;
CREATE FUNCTION t.consent() RETURNS jsonb LANGUAGE sql AS $$ SELECT club_consent_state('33333333-0000-4000-8000-000000000001','fixture-session') $$;
CREATE FUNCTION t.ck(n text,b boolean) RETURNS void LANGUAGE sql AS $$ SELECT t.ok('332',n,b) $$;
CREATE FUNCTION t.reject332(j jsonb,e text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN PERFORM t.pref(j); RAISE EXCEPTION 'invalid_accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>e THEN RAISE; END IF; END;
 PERFORM t.ck(e,true); END $$;
SELECT t.ck('initial unknown',t.consent()#>>'{email,state}'='unknown' AND t.consent()#>>'{ads,meta_ads,state}'='unknown');
SELECT t.pref('{"channel":"email","version":"email-v3","granted":true,"idempotency_key":"33333333-0000-4000-8000-000000000010"}');
SELECT t.ck('email granted ads independent',t.consent()#>>'{email,state}'='granted' AND t.consent()#>>'{ads,meta_ads,state}'='unknown');
SELECT t.pref('{"channel":"email","version":"email-v3","granted":true,"idempotency_key":"33333333-0000-4000-8000-000000000010"}');
SELECT t.ck('email retry once',(SELECT count(*)=1 FROM club_member_email_consents));
SELECT t.reject332('{"channel":"email","version":"email-v3","granted":false,"idempotency_key":"33333333-0000-4000-8000-000000000010"}','idempotency_conflict');
SELECT t.pref('{"channel":"ads","version":"anuncios-v1","granted":true,"platforms":["meta_ads","tiktok_ads","google_ads"],"idempotency_key":"33333333-0000-4000-8000-000000000011"}');
SELECT t.ck('three grants canonical',(SELECT count(*)=3 FROM marketing_consent_events) AND t.consent()#>>'{ads,google_ads,state}'='granted');
SELECT t.ck('three purpose subjects',(SELECT count(DISTINCT subject_id)=3 FROM club_member_marketing_consents));
SELECT t.pref('{"channel":"ads","version":"anuncios-v1","granted":true,"platforms":["google_ads","tiktok_ads","meta_ads"],"idempotency_key":"33333333-0000-4000-8000-000000000011"}');
SELECT t.ck('ads retry one set',(SELECT count(*)=3 FROM marketing_consent_events));
CREATE TABLE t.capture AS SELECT event_id,clock_timestamp() AS at FROM club_member_marketing_consents WHERE purpose='meta_ads';
SELECT t.ck('current binding valid',club_marketing_binding_valid('33333333-0000-4000-8000-000000000002','33333333-0000-4000-8000-000000000001','meta_ads',(SELECT event_id FROM t.capture),(SELECT at FROM t.capture)));
SELECT t.pref('{"channel":"ads","version":"anuncios-v1","granted":false,"platforms":["meta_ads"],"idempotency_key":"33333333-0000-4000-8000-000000000012"}');
SELECT t.ck('revoke only meta',t.consent()#>>'{ads,meta_ads,state}'='revoked' AND t.consent()#>>'{ads,tiktok_ads,state}'='granted' AND t.consent()#>>'{email,state}'='granted');
SELECT t.ck('later revoke invalidates binding',NOT club_marketing_binding_valid('33333333-0000-4000-8000-000000000002','33333333-0000-4000-8000-000000000001','meta_ads',(SELECT event_id FROM t.capture),(SELECT at FROM t.capture)));
SELECT t.pref('{"channel":"ads","version":"anuncios-v1","granted":true,"platforms":["meta_ads","tiktok_ads","google_ads"],"idempotency_key":"33333333-0000-4000-8000-000000000011"}');
SELECT t.ck('old grant retry never reopens',t.consent()#>>'{ads,meta_ads,state}'='revoked');
SELECT t.reject332('{"channel":"ads","version":"anuncios-v1","granted":true,"platforms":["meta_ads"],"expected_dates":{"meta_ads":null},"idempotency_key":"33333333-0000-4000-8000-000000000099"}','consent_revision_conflict');
SELECT t.pref('{"channel":"ads","version":"anuncios-v1","granted":true,"platforms":["meta_ads"],"idempotency_key":"33333333-0000-4000-8000-000000000013"}');
SELECT t.ck('regrant never legitimises old capture',NOT club_marketing_binding_valid('33333333-0000-4000-8000-000000000002','33333333-0000-4000-8000-000000000001','meta_ads',(SELECT event_id FROM t.capture),(SELECT at FROM t.capture)));
SELECT t.reject332('{"channel":"email","version":"v2","granted":true,"idempotency_key":"33333333-0000-4000-8000-000000000014"}','consent_payload');
SELECT t.reject332('{"channel":"email","version":"email-v3","granted":null,"idempotency_key":"33333333-0000-4000-8000-000000000014"}','consent_payload');
SELECT t.reject332('{"channel":"ads","version":"anuncios-v1","granted":true,"platforms":["other"],"idempotency_key":"33333333-0000-4000-8000-000000000014"}','consent_payload');
SELECT t.reject332('{"channel":"ads","version":"anuncios-v1","granted":true,"platforms":["meta_ads","meta_ads"],"idempotency_key":"33333333-0000-4000-8000-000000000014"}','consent_payload');
SELECT t.reject332('{"channel":"email","version":"email-v3","granted":true,"member_id":"fake","idempotency_key":"33333333-0000-4000-8000-000000000014"}','consent_payload');
UPDATE club_member_profiles SET birth_date=current_date-interval '12 years' WHERE member_id='33333333-0000-4000-8000-000000000002';
SELECT t.reject332('{"channel":"email","version":"email-v3","granted":true,"idempotency_key":"33333333-0000-4000-8000-000000000014"}','parental_flow_required');
SELECT t.pref('{"channel":"ads","version":"anuncios-v1","granted":false,"platforms":["meta_ads","tiktok_ads","google_ads"],"idempotency_key":"33333333-0000-4000-8000-000000000015"}');
SELECT t.ck('under13 revoke permitted',t.consent()#>>'{ads,meta_ads,state}'='revoked');
UPDATE club_member_profiles SET birth_date='2000-01-01' WHERE member_id='33333333-0000-4000-8000-000000000002';
UPDATE club_member_profiles SET birth_date=NULL WHERE member_id='33333333-0000-4000-8000-000000000002';
SELECT t.reject332('{"channel":"email","version":"email-v3","granted":true,"idempotency_key":"33333333-0000-4000-8000-000000000014"}','parental_flow_required');
UPDATE club_member_profiles SET birth_date='2000-01-01' WHERE member_id='33333333-0000-4000-8000-000000000002';
SELECT t.ck('state contains no tokens',t.consent()::text !~ '(token|subject|receipt|email_address|phone|member_id)');
SELECT t.ck('anon cannot call',NOT has_function_privilege('anon','club_profile_preferences(uuid,text,jsonb)','EXECUTE'));
SELECT t.ck('authenticated cannot call',NOT has_function_privilege('authenticated','club_consent_state(uuid,text)','EXECUTE'));
SELECT t.ck('service cannot mutate history',NOT has_table_privilege('service_role','club_member_email_consents','UPDATE') AND NOT has_table_privilege('service_role','club_member_email_consents','DELETE') AND NOT has_table_privilege('service_role','club_member_email_consents','TRUNCATE') AND NOT has_table_privilege('service_role','club_member_email_consents','MAINTAIN'));
-- Actual trigger error tests, not mock atomicity.
INSERT INTO email_unsubscribe_tokens(id,token,email,company_id) VALUES('33333333-0000-4000-8000-000000000020','fixture-unsubscribe','member@example.invalid','7c858982-6ccd-47ca-bd65-e0dd3eebf01c');
CREATE FUNCTION t.fail_suppress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected_suppression_failure'; END $$;
CREATE TRIGGER fail_suppress BEFORE INSERT ON suppressed_emails FOR EACH ROW EXECUTE FUNCTION t.fail_suppress();
DO $$ DECLARE n bigint; BEGIN SELECT count(*) INTO n FROM club_member_email_consents;
 BEGIN PERFORM email_unsubscribe_atomic('fixture-unsubscribe'); RAISE EXCEPTION 'invalid_accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'injected_suppression_failure' THEN RAISE; END IF; END;
 PERFORM t.ck('unsubscribe fault token unused',(SELECT used_at IS NULL FROM email_unsubscribe_tokens WHERE token='fixture-unsubscribe'));
 PERFORM t.ck('unsubscribe fault ledger unchanged',(SELECT count(*)=n FROM club_member_email_consents)); END $$;
DROP TRIGGER fail_suppress ON suppressed_emails;
SELECT t.ck('unsubscribe succeeds',email_unsubscribe_atomic('fixture-unsubscribe')->>'success'='true');
SELECT t.ck('unsubscribe email+all ads revoked',t.consent()#>>'{email,state}'='revoked' AND t.consent()#>>'{ads,google_ads,state}'='revoked' AND t.consent()#>>'{ads,tiktok_ads,state}'='revoked');
SELECT t.ck('unsubscribe suppression+claim',(SELECT used_at IS NOT NULL FROM email_unsubscribe_tokens WHERE token='fixture-unsubscribe') AND (SELECT count(*)=1 FROM suppressed_emails));
SELECT t.ck('unsubscribe retry',email_unsubscribe_atomic('fixture-unsubscribe')->>'reason'='already_unsubscribed');
SELECT t.ck('invalid unsubscribe',email_unsubscribe_atomic('invalid')->>'error'='Invalid or expired token');
INSERT INTO email_unsubscribe_tokens(token,email,company_id) VALUES('coala-fixture','coala@example.invalid','00000000-0000-4000-8000-0000000000a1');
SELECT t.ck('coala suppression preserved',email_unsubscribe_atomic('coala-fixture')->>'success'='true');
SELECT t.reject332('{"channel":"email","version":"email-v3","granted":true,"expected_dates":{"email":null},"idempotency_key":"33333333-0000-4000-8000-000000000098"}','consent_revision_conflict');
DO $$ BEGIN
 BEGIN PERFORM club_consent_state('33333333-0000-4000-8000-000000000001','invalid'); RAISE EXCEPTION 'invalid_accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'no_session' THEN RAISE; END IF; END;
 PERFORM t.ck('invalid session',true);
 BEGIN PERFORM club_consent_state('00000000-0000-4000-8000-0000000000a2','fixture-session'); RAISE EXCEPTION 'invalid_accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'no_session' THEN RAISE; END IF; END;
 PERFORM t.ck('cross-site session denied',true);
 BEGIN UPDATE club_member_email_consents SET decision='granted'; RAISE EXCEPTION 'invalid_accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'consent_history_immutable' THEN RAISE; END IF; END;
 PERFORM t.ck('append only enforced',true);
END $$;
SELECT count(*) FILTER(WHERE ok)||'/'||count(*) AS assertions_332 FROM t.results WHERE phase='332';