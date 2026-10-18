-- INERTE controller template; review AND separate future activation authorization required.
-- Render literals ONLY in DECLARE assignments, never global text replacement/comments.
BEGIN;
DO $pilot$ DECLARE
 u uuid := '__OWNER_UUID__'; c uuid := '__COMPANY_UUID__';
 marker text := '__NEW_FIXTURE_MARKER__'; email_value text := '__NEW_FIXTURE_EMAIL__';
 n integer;
BEGIN
 IF u IS NULL OR c IS NULL OR marker NOT LIKE 'issue333-pilot8-%' OR email_value NOT LIKE '%@fixture.invalid' THEN RAISE EXCEPTION 'invalid pilot parameters'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users au JOIN profiles pr ON pr.id=au.id
 WHERE au.id=u AND au.email=email_value AND au.raw_user_meta_data->>'fixture_marker'=marker
 AND au.raw_user_meta_data->>'company_id'=c::text AND au.created_at>clock_timestamp()-interval '10 minutes'
 AND au.email_confirmed_at IS NOT NULL AND au.last_sign_in_at IS NULL
 AND (au.banned_until IS NULL OR au.banned_until<clock_timestamp())
 AND pr.company_id=c AND pr.active_company_id IS NOT DISTINCT FROM c
 AND nullif(btrim(pr.full_name),'') IS NOT NULL) THEN RAISE EXCEPTION 'new fixture provenance/context failed'; END IF;
 IF (SELECT count(*) FROM user_roles WHERE user_id=u)<>1 OR NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND company_id=c AND role='manager') THEN RAISE EXCEPTION 'exclusive manager membership required'; END IF;
 IF EXISTS(SELECT 1 FROM data_entry_settings WHERE execute_validated OR preparation_validated)
 OR EXISTS(SELECT 1 FROM standalone_attempt_settings_333 WHERE enabled) THEN RAISE EXCEPTION 'global gates must remain closed'; END IF;
 IF EXISTS(SELECT 1 FROM data_entry_pilot8_allowlist WHERE enabled AND expires_at>clock_timestamp())
 OR EXISTS(SELECT 1 FROM data_entry_sessions WHERE owner_id=u)
 OR EXISTS(SELECT 1 FROM standalone_attempts_333 WHERE principal=u::text)
 OR EXISTS(SELECT 1 FROM standalone_invoices WHERE created_by=u) THEN RAISE EXCEPTION 'fresh single pilot required'; END IF;
 INSERT INTO data_entry_pilot8_allowlist(owner_id,company_id,operation,enabled,expires_at,reviewed_note)
 SELECT u,c,op,true,clock_timestamp()+interval '10 minutes','FICTITIOUS pilot8 reviewed; one document only'
 FROM unnest(ARRAY['preparation','assistant_create']) op;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>2 THEN RAISE EXCEPTION 'activation rowcount'; END IF;
END $pilot$;
COMMIT;
-- End pilot: reviewed exclusive UPDATE enabled=false WHERE owner_id/company_id match; keep rows/objects/evidence.
-- Auth finally: global logout, ban only future fixture, SELECT sessions=0. No DELETE or global settings write.
