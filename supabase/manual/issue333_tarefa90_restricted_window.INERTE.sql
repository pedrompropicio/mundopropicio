-- FUTURE PHASE9 ONLY. Not executable before exact private owner/company review and authorization.
-- Actual preflight found zero keys; unlike79, explicit creation of TWO scoped capability keys is needed.
-- No accounts/documents/fixtures, no legacy settings changes. Parameters are not secrets.
BEGIN;
DO $window$
DECLARE u uuid:='__REVIEWED_EXISTING_OWNER_UUID__'; co uuid:='__REVIEWED_COMPANY_UUID__'; expiry timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('issue333-pilot8-controller',3338));
 LOCK TABLE public.data_entry_pilot8_allowlist IN SHARE ROW EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM public.data_entry_pilot8_allowlist)
 OR EXISTS(SELECT 1 FROM public.data_entry_settings WHERE preparation_validated OR execute_validated)
 OR EXISTS(SELECT 1 FROM public.standalone_attempt_settings_333 WHERE enabled)
 THEN RAISE EXCEPTION 'reviewed_closed_configuration_drift'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=u FOR SHARE;
 PERFORM 1 FROM public.user_roles WHERE user_id=u ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.companies WHERE id=co FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND coalesce(active_company_id,company_id)=co)
 OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND company_id=co AND role='manager')
 OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=co AND status='active')
 OR public._effective_permissions_for(u,co,'{}'::text[])->>'role' IS DISTINCT FROM 'manager'
 THEN RAISE EXCEPTION 'reviewed_existing_context_drift'; END IF;
 expiry:=clock_timestamp()+interval '600 seconds';
 INSERT INTO public.data_entry_pilot8_allowlist(owner_id,company_id,operation,enabled,expires_at,reviewed_note)
 VALUES(u,co,'preparation',true,expiry,'issue333-release9-reviewed-window-v1'),(u,co,'assistant_create',true,expiry,'issue333-release9-reviewed-window-v1');
END $window$;
-- Capture both composite keys + expiry in private controller evidence; do not publish owner IDs.
SELECT operation,enabled,expires_at,reviewed_note FROM public.data_entry_pilot8_allowlist
WHERE owner_id='__REVIEWED_EXISTING_OWNER_UUID__' AND company_id='__REVIEWED_COMPANY_UUID__' ORDER BY operation;
COMMIT;
