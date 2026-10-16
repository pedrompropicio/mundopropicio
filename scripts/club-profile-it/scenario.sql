\set ON_ERROR_STOP 1
-- Real motor #327 cutover + fixtures; nenhum utilizador real.
UPDATE portal_sites SET domain='newgangfestival.pt' WHERE id='00000000-0000-4000-8000-0000000000a2';
INSERT INTO club_points_config(company_id,site_id,version,event_id,status,legacy_counts,join_points,referral_points,referral_cap,crew_points,purchase_points,levels)
 VALUES('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2','330-baseline','00000000-0000-4000-8000-0000000000e1','draft',true,100,75,750,100,200,'{"Gang":0,"Crew":750,"Goat":3000}');
SELECT club_points_cutover((SELECT id FROM club_points_config WHERE version='330-baseline'),'{"Gang":0,"Crew":500,"Goat":1500}');
CREATE FUNCTION t.session(p_email text,p_confirm boolean DEFAULT true) RETURNS text LANGUAGE plpgsql AS $$
DECLARE m uuid; h text:=md5(p_email); BEGIN m:=CASE WHEN p_confirm THEN t.newc(p_email) ELSE t.new(p_email) END;
 INSERT INTO club_member_sessions(member_id,site_id,token_hash,purpose,expires_at) VALUES(m,'00000000-0000-4000-8000-0000000000a2',h,'access',now()+interval '1 day'); RETURN h; END $$;
CREATE FUNCTION t.payload() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"confirm":true,"birth_date":"2000-02-29","birth_country":"br","residence_country":"pt","city":"  Lisboa   Centro  "}'::jsonb $$;
CREATE FUNCTION t.call(h text,j jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT club_profile_confirm('00000000-0000-4000-8000-0000000000a2',h,j) $$;
CREATE FUNCTION t.state(h text) RETURNS jsonb LANGUAGE sql AS $$ SELECT club_profile_state('00000000-0000-4000-8000-0000000000a2',h) $$;
CREATE FUNCTION t.reject(h text,j jsonb,e text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN PERFORM t.call(h,j); RAISE EXCEPTION 'accepted_invalid'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>e THEN RAISE; END IF; END;
 PERFORM t.ok('330',e||':'||j::text,true); END $$;
SELECT t.session('profile@example.invalid'); SELECT t.session('pending@example.invalid',false);
SELECT t.ok('330','config absent no claim',NOT (t.state(md5('profile@example.invalid'))->>'available')::boolean);
SELECT t.reject(md5('profile@example.invalid'),t.payload(),'profile_unavailable');
SELECT club_profile_configure('00000000-0000-4000-8000-0000000000a2','profile-v1',true);
SELECT t.ok('330','249 ISO codes',(SELECT count(*)=249 FROM club_profile_countries));
SELECT t.reject(md5('pending@example.invalid'),t.payload(),'no_session');
SELECT t.reject('bad',t.payload(),'no_session');
SELECT t.reject(md5('profile@example.invalid'),t.payload()-'confirm','profile_confirmation_required');
SELECT t.reject(md5('profile@example.invalid'),t.payload()||'{"confirm":false}','profile_confirmation_required');
SELECT t.reject(md5('profile@example.invalid'),t.payload()||'{"birth_date":"2025-02-29"}','birth_date_invalid');
SELECT t.reject(md5('profile@example.invalid'),t.payload()||'{"birth_date":"2100-01-01"}','birth_date_invalid');
SELECT t.reject(md5('profile@example.invalid'),t.payload()-'birth_date','birth_date_invalid');
SELECT t.reject(md5('profile@example.invalid'),t.payload()||'{"birth_country":"XX"}','country_invalid');
SELECT t.reject(md5('profile@example.invalid'),t.payload()-'residence_country','country_invalid');
SELECT t.reject(md5('profile@example.invalid'),t.payload()||'{"city":"<script>"}','city_invalid');
SELECT t.reject(md5('profile@example.invalid'),t.payload()||jsonb_build_object('city',repeat('a',121)),'city_invalid');
SELECT t.reject(md5('profile@example.invalid'),t.payload()-'city','city_invalid');
SELECT t.reject(md5('profile@example.invalid'),t.payload()||'{"member_id":"fake","points":500}','profile_payload');
SELECT t.reject(md5('profile@example.invalid'),t.payload()||'{"whatsapp":true}','profile_payload');
SELECT t.reject(md5('profile@example.invalid'),t.payload()||'{"parental_consent":true}','profile_payload');
SELECT t.reject(md5('profile@example.invalid'),t.payload()||jsonb_build_object('birth_date',((now() AT TIME ZONE 'Europe/Lisbon')::date-interval '12 years')::date::text),'parental_flow_required');
SELECT t.reject(md5('profile@example.invalid'),t.payload()||'{"phone":"123"}','phone_invalid');
-- Preenchido pelo CRM / import histórico só como fixture: abrir não premia.
INSERT INTO club_member_profiles(member_id,company_id,site_id,birth_date,birth_country,residence_country,city)
 SELECT id,company_id,site_id,'2000-02-29','BR','PT','Lisboa' FROM club_members WHERE email='profile@example.invalid';
SELECT t.ok('330','prefilled open no reward',(t.state(md5('profile@example.invalid'))->>'complete')::boolean AND NOT (t.state(md5('profile@example.invalid'))->>'reward_claimed')::boolean);
SELECT t.ok('330','explicit completion no phone no marketing earns exactly50',(t.call(md5('profile@example.invalid'),t.payload())->>'awarded')::int=50);
SELECT t.ok('330','normalization different countries',(t.state(md5('profile@example.invalid'))->>'birth_country')='BR' AND (t.state(md5('profile@example.invalid'))->>'residence_country')='PT' AND (t.state(md5('profile@example.invalid'))->>'city')='Lisboa Centro');
SELECT t.ok('330','retry no credit',(t.call(md5('profile@example.invalid'),t.payload())->>'awarded')::int=0);
SELECT t.call(md5('profile@example.invalid'),'{"op":"clear"}');
SELECT t.ok('330','clear keeps claimed',(t.state(md5('profile@example.invalid'))->>'reward_claimed')::boolean);
SELECT t.ok('330','restore no credit',(t.call(md5('profile@example.invalid'),t.payload())->>'awarded')::int=0);
SELECT t.ok('330','phone null no credit',(t.call(md5('profile@example.invalid'),t.payload()||'{"phone":null}')->>'awarded')::int=0);
-- Under18 accepted, exact calendar 13 boundary, not a generic adult gate.
SELECT t.session('teen@example.invalid');
SELECT t.ok('330','exact 13 accepted',(t.call(md5('teen@example.invalid'),t.payload()||jsonb_build_object('birth_date',((now() AT TIME ZONE 'Europe/Lisbon')::date-interval '13 years')::date::text))->>'awarded')::int=50);
-- Point void never opens eligibility.
INSERT INTO club_points(company_id,member_id,rule_key,points,ref_id)
 SELECT company_id,id,'void',-50,'profile_complete:'||id FROM club_members WHERE email='profile@example.invalid';
SELECT t.ok('330','void no renewal',(t.call(md5('profile@example.invalid'),t.payload())->>'awarded')::int=0 AND (t.state(md5('profile@example.invalid'))->>'points')::int=0);
UPDATE portal_sites SET event_id='00000000-0000-4000-8000-0000000000e2' WHERE domain='newgangfestival.pt';
SELECT t.ok('330','new edition no renewal',(t.call(md5('profile@example.invalid'),t.payload())->>'awarded')::int=0);
SELECT t.ok('330','award original event',(SELECT event_id='00000000-0000-4000-8000-0000000000e1' FROM club_points WHERE rule_key='profile_complete' AND member_id=t.m('profile@example.invalid')));
UPDATE portal_sites SET event_id='00000000-0000-4000-8000-0000000000e1' WHERE domain='newgangfestival.pt';
-- Fault injection real trigger: tout revient en arrière.
SELECT t.session('fault@example.invalid');
CREATE FUNCTION t.fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.rule_key='profile_complete' AND NEW.member_id=t.m('fault@example.invalid') THEN RAISE EXCEPTION 'injected_credit_failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER fault330 BEFORE INSERT ON club_points FOR EACH ROW EXECUTE FUNCTION t.fault();
SELECT t.reject(md5('fault@example.invalid'),t.payload(),'injected_credit_failure');
SELECT t.ok('330','atomic fault profile absent',NOT EXISTS(SELECT 1 FROM club_member_profiles WHERE member_id=t.m('fault@example.invalid')));
DROP TRIGGER fault330 ON club_points;
SELECT t.ok('330','retry after fault earns50',(t.call(md5('fault@example.invalid'),t.payload())->>'awarded')::int=50);
-- Scope/session + ACL/RLS avec vraies SET ROLE, helpers de frontière GUC contrôlés.
UPDATE club_member_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=md5('pending@example.invalid');
SELECT t.reject(md5('pending@example.invalid'),t.payload(),'no_session');
DO $$ BEGIN BEGIN PERFORM club_profile_confirm('00000000-0000-4000-8000-0000000000b2',md5('profile@example.invalid'),t.payload()); RAISE EXCEPTION 'accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'no_session' THEN RAISE; END IF; END; PERFORM t.ok('330','session wrong site blocked',true); END $$;
SELECT t.ok('330','RPC ACL closed anon/auth',(SELECT bool_and(NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE') AND has_function_privilege('service_role',oid,'EXECUTE')) FROM pg_proc WHERE proname IN ('club_profile_confirm','club_profile_state','club_profile_configure')));
CREATE OR REPLACE FUNCTION row_belongs_to_current_company(company_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT company_id::text=current_setting('it.company',true) $$;
CREATE OR REPLACE FUNCTION has_role(_user_id uuid,_role app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT _user_id IS NOT NULL AND _role::text=current_setting('it.role',true) $$;
GRANT USAGE ON SCHEMA t TO authenticated,anon; GRANT INSERT ON t.results TO authenticated,anon; GRANT USAGE ON SEQUENCE t.results_n_seq TO authenticated,anon; GRANT EXECUTE ON FUNCTION t.ok(text,text,boolean,text) TO authenticated,anon;
SET request.jwt.claim.sub='00000000-0000-4000-8000-0000000000f1'; SET it.role='admin'; SET it.company='00000000-0000-4000-8000-0000000000a1';
SET ROLE authenticated;
SELECT t.ok('330','staff same company sees profile',(SELECT count(*)>0 FROM club_member_profiles));
SET it.company='00000000-0000-4000-8000-0000000000c1';
SELECT t.ok('330','other company zero profiles',(SELECT count(*)=0 FROM club_member_profiles));
DO $$ BEGIN BEGIN UPDATE club_member_profiles SET city='bad'; RAISE EXCEPTION 'accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; PERFORM t.ok('330','staff cannot write profile',true); END $$;
RESET ROLE;
-- Snapshot original protected Goat stays, ledger originals untouched.
SELECT t.ok('330','Goat protected remains',(SELECT level_name='Goat' AND protected FROM club_member_level(t.m('lv1500@example.invalid'))));
SELECT t.session('race@example.invalid');
CREATE TABLE t.ledger330 AS SELECT id,points,event_id,ref_id FROM club_points;

-- Guards that can fail: no guessed truths, no constant escalation, no completion reset.
DO $$ DECLARE v uuid:=t.m('race@example.invalid'); BEGIN
 BEGIN PERFORM club_award_fixed(v,'profile_complete',v::text,500); RAISE EXCEPTION 'accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'profile_award_invalid' THEN RAISE; END IF; END;
 PERFORM t.ok('330','award_fixed cannot bypass500',true);
 BEGIN UPDATE club_member_profiles SET completed_at=NULL,award_event_id=NULL,award_id=NULL WHERE member_id=t.m('profile@example.invalid'); RAISE EXCEPTION 'accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'profile_completion_immutable' THEN RAISE; END IF; END;
 PERFORM t.ok('330','completion tombstone immutable',true);
 BEGIN UPDATE club_point_rules SET points=500 WHERE rule_key='profile_complete'; RAISE EXCEPTION 'accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'profile_rule_protected' THEN RAISE; END IF; END;
 PERFORM t.ok('330','CRM constant protected500',true);
 BEGIN INSERT INTO club_member_profiles(member_id,site_id,company_id) VALUES(t.m('race@example.invalid'),'00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000a1'); RAISE EXCEPTION 'accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'profile_scope' THEN RAISE; END IF; END;
 PERFORM t.ok('330','row member/site mismatch blocked',true);
END $$;
SELECT t.session('purpose@example.invalid');
UPDATE club_member_sessions SET purpose='confirm' WHERE token_hash=md5('purpose@example.invalid');
SELECT t.reject(md5('purpose@example.invalid'),t.payload(),'no_session');
SELECT t.session('expired@example.invalid');
UPDATE club_member_sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=md5('expired@example.invalid');
SELECT t.reject(md5('expired@example.invalid'),t.payload(),'no_session');
SET ROLE anon;
DO $$ BEGIN BEGIN PERFORM count(*) FROM club_member_profiles; RAISE EXCEPTION 'accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; PERFORM t.ok('330','anon no private profile read',true); END $$;
RESET ROLE;
-- Negative points + tier floors unchanged when profile credit is legitimate.
SELECT t.session('negative330@example.invalid');
SELECT t.seed(t.m('negative330@example.invalid'),-250);
SELECT t.ok('330','negative points preserved add50',(t.call(md5('negative330@example.invalid'),t.payload())->>'awarded')::int=50 AND t.pts(t.m('negative330@example.invalid'))=-100);
