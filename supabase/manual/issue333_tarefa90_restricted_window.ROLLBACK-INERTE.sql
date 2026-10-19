-- FUTURE EXACT REVOCATION ONLY, approved private identity + returned expiry required.
BEGIN;
UPDATE public.data_entry_pilot8_allowlist SET enabled=false
WHERE owner_id='__REVIEWED_EXISTING_OWNER_UUID__' AND company_id='__REVIEWED_COMPANY_UUID__'
AND operation IN ('preparation','assistant_create') AND reviewed_note='issue333-release9-reviewed-window-v1'
AND expires_at='__EXACT_RETURNED_EXPIRY__'::timestamptz;
-- Require exactly two matching keys; no deletion or restoration of enabled keys.
SELECT count(*) matched,count(*) FILTER(WHERE enabled) still_enabled FROM public.data_entry_pilot8_allowlist
WHERE owner_id='__REVIEWED_EXISTING_OWNER_UUID__' AND company_id='__REVIEWED_COMPANY_UUID__'
AND operation IN ('preparation','assistant_create') AND reviewed_note='issue333-release9-reviewed-window-v1'
AND expires_at='__EXACT_RETURNED_EXPIRY__'::timestamptz;
COMMIT;
