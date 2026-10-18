-- NEW INERT73. Only reviewed two rows; preserve evidence, never DELETE/GRANT.
BEGIN;
DO $revoke$ DECLARE
 p jsonb := '__MANIFEST73_PARAMETERS__'::jsonb;
 n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('issue333-pilot8-controller',3338));
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles pr ON pr.id=u.id
 WHERE u.id=(p->>'owner_id')::uuid AND u.created_at=(p->>'created_at')::timestamptz
 AND u.email=p->>'email' AND u.raw_user_meta_data->>'fixture_marker'=p->>'fixture_marker'
 AND u.raw_user_meta_data->>'company_id'=p->>'company_id' AND pr.company_id=(p->>'company_id')::uuid)
 THEN RAISE EXCEPTION 'exclusive identity refused' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.data_entry_pilot8_allowlist WHERE owner_id=(p->>'owner_id')::uuid FOR UPDATE;
 IF (SELECT count(*) FROM public.data_entry_pilot8_allowlist WHERE owner_id=(p->>'owner_id')::uuid)<>2
 THEN RAISE EXCEPTION 'exclusive scope != 2' USING ERRCODE='55000'; END IF;
 UPDATE public.data_entry_pilot8_allowlist SET enabled=false
 WHERE owner_id=(p->>'owner_id')::uuid AND company_id=(p->>'company_id')::uuid
 AND operation IN ('preparation','assistant_create')
 AND reviewed_note='FICTITIOUS one PDF; '||(p->>'fixture_marker')||'; SHA256='||(p->>'document_sha256');
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>2 THEN RAISE EXCEPTION 'exclusive revocation != 2' USING ERRCODE='55000'; END IF;
END $revoke$;
COMMIT;