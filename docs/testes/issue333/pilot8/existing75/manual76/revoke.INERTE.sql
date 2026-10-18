-- REVIEW ONLY. Use exact owner and expires_at returned by activation; no owner-wide cleanup.
BEGIN;
DO $revoke$
DECLARE u uuid:='__REVIEWED_OWNER_UUID__'; c uuid:='7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
 expiry timestamptz:='__EXACT_RETURNED_EXPIRES_AT__'; n integer;
 note text:='FICTITIOUS one PDF; issue333-pilot8-63b8a466ff893f26f00e6ba66cce7f6a; SHA256=8ae66f6a452934a1f43a5d9fb2c5f22fef7e407e4d2f1b8db53f03d75794798f';
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('issue333-pilot8-controller',3338));
 PERFORM 1 FROM public.data_entry_pilot8_allowlist WHERE owner_id=u AND company_id=c
 AND operation IN ('preparation','assistant_create') AND reviewed_note=note AND expires_at=expiry
 ORDER BY operation FOR UPDATE;
 IF (SELECT count(*) FROM public.data_entry_pilot8_allowlist WHERE owner_id=u AND company_id=c
 AND operation IN ('preparation','assistant_create') AND reviewed_note=note AND expires_at=expiry)<>2
 THEN RAISE EXCEPTION 'Exact new permission keys drift; no broad fallback'; END IF;
 UPDATE public.data_entry_pilot8_allowlist SET enabled=false WHERE owner_id=u AND company_id=c
 AND operation IN ('preparation','assistant_create') AND reviewed_note=note AND expires_at=expiry;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>2 THEN RAISE EXCEPTION 'Expected exactly two revoked rows'; END IF;
END $revoke$;
COMMIT;
