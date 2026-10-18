-- INERTE. Controller revokes only the two reviewed rows, never deletes evidence.
BEGIN;
DO $revoke$ DECLARE
 p jsonb := '__PARAMETERS_JSON__'::jsonb;
 n integer;
BEGIN
 UPDATE public.data_entry_pilot8_allowlist SET enabled=false
 WHERE owner_id=(p->>'owner_id')::uuid AND company_id=(p->>'company_id')::uuid
 AND operation IN ('preparation','assistant_create')
 AND reviewed_note='FICTITIOUS one PDF; '||(p->>'fixture_marker')||'; SHA256='||(p->>'document_sha256');
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>2 THEN RAISE EXCEPTION 'pilot8 exclusive revocation ROW_COUNT != 2' USING ERRCODE='55000'; END IF;
END $revoke$;
COMMIT;