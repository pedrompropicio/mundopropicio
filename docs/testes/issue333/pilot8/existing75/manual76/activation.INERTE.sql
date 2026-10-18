-- REVIEW ONLY. Replace __REVIEWED_OWNER_UUID__ with the privately reviewed existing owner.
-- No role/profile/account/session mutation. PK is (owner_id,company_id,operation), not an id.
BEGIN;
DO $pilot$
DECLARE
 u uuid := '__REVIEWED_OWNER_UUID__';
 c uuid := '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
 marker text := 'issue333-pilot8-63b8a466ff893f26f00e6ba66cce7f6a';
 note text := 'FICTITIOUS one PDF; issue333-pilot8-63b8a466ff893f26f00e6ba66cce7f6a; SHA256=8ae66f6a452934a1f43a5d9fb2c5f22fef7e407e4d2f1b8db53f03d75794798f';
 expiry timestamptz; n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('issue333-pilot8-controller',3338));
 LOCK TABLE public.data_entry_pilot8_allowlist IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.data_entry_settings,public.standalone_attempt_settings_333 IN SHARE MODE;
 PERFORM 1 FROM public.profiles WHERE id=u FOR SHARE;
 PERFORM 1 FROM public.user_roles WHERE user_id=u ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.companies WHERE id=c FOR SHARE;
 IF marker !~ '^issue333-pilot8-[a-f0-9]{32}$' OR
 NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND company_id=c AND active_company_id IS NULL) OR
 NOT EXISTS(SELECT 1 FROM public.companies WHERE id=c AND status='active') OR
 (SELECT count(*) FROM public.user_roles WHERE user_id=u)<>1 OR
 NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND company_id=c AND role='manager') OR
 public._effective_permissions_for(u,c,'{}'::text[])->>'role' IS DISTINCT FROM 'manager' OR
 NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
 THEN RAISE EXCEPTION 'Existing owner/company/authority drift'; END IF;
 -- Canonical resolver source + its exact current fallback inputs checked above; no fabricated JWT context.
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.current_company_id()'::regprocedure) IS DISTINCT FROM 'f857f027a44e858399e895d702af7ad0' OR
 (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.data_entry_pilot8_gate(text)'::regprocedure) IS DISTINCT FROM '1e066a6df3637c8d5c8f99f00a255d33' OR
 (SELECT md5(prosrc) FROM pg_proc WHERE oid='public._effective_permissions_for(uuid,uuid,text[])'::regprocedure) IS DISTINCT FROM 'a6c16467e8b556f8b006f9fc68765812' OR
 (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.log_table_change()'::regprocedure) IS DISTINCT FROM '9509fe109550c9e0367fcbe4ffc661c5' OR
 (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.set_company_id_on_insert()'::regprocedure) IS DISTINCT FROM '949120b4d6c08f0c8707f63d28708d96' OR
 (SELECT md5(prosrc) FROM pg_proc WHERE oid='auth.uid()'::regprocedure) IS DISTINCT FROM 'cdef18c69c4f4cbbced2eaf81e628b49'
 THEN RAISE EXCEPTION 'Reviewed source drift'; END IF;
 IF EXISTS(SELECT 1 FROM public.data_entry_settings WHERE preparation_validated OR execute_validated) OR
 EXISTS(SELECT 1 FROM public.standalone_attempt_settings_333 WHERE enabled) OR
 EXISTS(SELECT 1 FROM public.data_entry_pilot8_allowlist WHERE enabled OR owner_id=u OR reviewed_note=note) OR
 EXISTS(SELECT 1 FROM public.standalone_invoices WHERE invoice_number='FICTICIO-'||marker)
 THEN RAISE EXCEPTION 'Closed gates/reference/new composite keys conflict'; END IF;
 expiry:=clock_timestamp()+interval '600 seconds';
 INSERT INTO public.data_entry_pilot8_allowlist(owner_id,company_id,operation,enabled,expires_at,reviewed_note)
 SELECT u,c,op,true,expiry,note FROM unnest(ARRAY['preparation','assistant_create']) op;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>2 THEN RAISE EXCEPTION 'Expected exactly two new permissions'; END IF;
END $pilot$;
-- Save these exact composite keys + note + expires_at upstream before committing/using the modal.
SELECT owner_id,company_id,operation,enabled,expires_at,reviewed_note
FROM public.data_entry_pilot8_allowlist
WHERE owner_id='__REVIEWED_OWNER_UUID__' AND company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
AND reviewed_note='FICTITIOUS one PDF; issue333-pilot8-63b8a466ff893f26f00e6ba66cce7f6a; SHA256=8ae66f6a452934a1f43a5d9fb2c5f22fef7e407e4d2f1b8db53f03d75794798f'
ORDER BY operation;
COMMIT;
