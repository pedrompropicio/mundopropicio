-- INERTE. Controller revokes only the two reviewed rows, never deletes evidence.
BEGIN;
DO $revoke$ DECLARE
 p jsonb := '{"owner_id":"PLACEHOLDER-UUID-OWNER","company_id":"7c858982-6ccd-47ca-bd65-e0dd3eebf01c","role_id":"PLACEHOLDER-UUID-ROLE","fixture_marker":"issue333-pilot8-11af044ae28127538fe8cc06be67541a","email":"issue333-pilot8-11af044ae28127538fe8cc06be67541a@fixture.invalid","document_sha256":"8ae66f6a452934a1f43a5d9fb2c5f22fef7e407e4d2f1b8db53f03d75794798f","document_size":1517,"document_mime":"application/pdf","invoice_number":"FICTICIO-issue333-pilot8-11af044ae28127538fe8cc06be67541a","created_at":"PLACEHOLDER-ISO8601-CRIACAO","window_start":"PLACEHOLDER-ISO8601-INICIO","window_end":"PLACEHOLDER-ISO8601-FIM-MAX-10MIN"}'::jsonb;
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