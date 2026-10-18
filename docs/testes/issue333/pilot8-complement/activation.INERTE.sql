-- INERTE. Controller query_database ONLY after independent review/future authorization.
-- DIFF vs pilot8/activation.INERTE.sql: guarda de allowlist vazia passa a 'WHERE enabled' — as 2 linhas REVOGADAS do piloto59 sao prova preservada (nunca DELETE); a semantica 'allowlist VAZIA sempre' = zero permissoes ATIVAS, inalterada.
-- DIFF prova64: identidade = a EXATA revista no checkpoint63 + SELECT independente do controller (created_at por igualdade exata);
--   'au.created_at NOT BETWEEN window' passa a 'au.created_at > window_start' (nunca identidade futura). A janela (<=10 min, clock dentro)
--   aplica-se SO ao momento da ativacao; permissoes continuam a expirar em 10 min. Nenhum outro guard alterado.
-- Render ONLY the JSON literal assigned to p in DECLARE. No credentials in parameters.
BEGIN;
DO $pilot$ DECLARE
 p jsonb := '{"owner_id":"PLACEHOLDER-UUID-OWNER","company_id":"7c858982-6ccd-47ca-bd65-e0dd3eebf01c","role_id":"PLACEHOLDER-UUID-ROLE","fixture_marker":"issue333-pilot8-11af044ae28127538fe8cc06be67541a","email":"issue333-pilot8-11af044ae28127538fe8cc06be67541a@fixture.invalid","document_sha256":"8ae66f6a452934a1f43a5d9fb2c5f22fef7e407e4d2f1b8db53f03d75794798f","document_size":1517,"document_mime":"application/pdf","invoice_number":"FICTICIO-issue333-pilot8-11af044ae28127538fe8cc06be67541a","created_at":"PLACEHOLDER-ISO8601-CRIACAO","window_start":"PLACEHOLDER-ISO8601-INICIO","window_end":"PLACEHOLDER-ISO8601-FIM-MAX-10MIN"}'::jsonb;
 u uuid := (p->>'owner_id')::uuid; c uuid := (p->>'company_id')::uuid;
 r uuid := (p->>'role_id')::uuid; n integer; audit_before bigint;
 au auth.users; pr public.profiles; ur public.user_roles;
 prior_sub text; prior_claims text; canonical uuid; expiry timestamptz;
BEGIN
 IF u IS NULL OR c IS NULL OR r IS NULL OR
 coalesce(p->>'fixture_marker','') !~ '^issue333-pilot8-[a-f0-9]{32}$' OR
 coalesce(p->>'email','') !~ '^issue333-pilot8-[a-f0-9]{32}@fixture\.invalid$' OR
 p->>'email' IS DISTINCT FROM (p->>'fixture_marker')||'@fixture.invalid' OR
 coalesce(p->>'document_sha256','') !~ '^[a-f0-9]{64}$' OR
 (p->>'document_size')::integer NOT BETWEEN 64 AND 20971520 OR
 p->>'document_mime' IS DISTINCT FROM 'application/pdf' OR
 p->>'invoice_number' IS DISTINCT FROM 'FICTICIO-'||(p->>'fixture_marker') OR
 p->>'created_at' IS NULL OR p->>'window_start' IS NULL OR p->>'window_end' IS NULL OR
 (p->>'window_end')::timestamptz <= (p->>'window_start')::timestamptz OR
 (p->>'window_end')::timestamptz-(p->>'window_start')::timestamptz > interval '10 minutes' OR
 clock_timestamp() NOT BETWEEN (p->>'window_start')::timestamptz AND (p->>'window_end')::timestamptz
 THEN RAISE EXCEPTION 'pilot8 parameters/window refused' USING ERRCODE='22023'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.current_company_id()'::regprocedure) IS DISTINCT FROM 'f857f027a44e858399e895d702af7ad0' OR
 (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.log_table_change()'::regprocedure) IS DISTINCT FROM '9509fe109550c9e0367fcbe4ffc661c5' OR
 (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.set_company_id_on_insert()'::regprocedure) IS DISTINCT FROM '949120b4d6c08f0c8707f63d28708d96' OR
 (SELECT md5(prosrc) FROM pg_proc WHERE oid='auth.uid()'::regprocedure) IS DISTINCT FROM 'cdef18c69c4f4cbbced2eaf81e628b49' OR
 (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.data_entry_pilot8_gate(text)'::regprocedure) IS DISTINCT FROM '1e066a6df3637c8d5c8f99f00a255d33' OR
 NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.user_roles'::regclass AND tgname='audit_user_roles_changes' AND tgfoid='public.log_table_change()'::regprocedure AND tgenabled='O' AND tgtype=29 AND NOT tgisinternal) OR
 NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.user_roles'::regclass AND tgname='trg_set_company_id' AND tgfoid='public.set_company_id_on_insert()'::regprocedure AND tgenabled='O' AND tgtype=7 AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'pilot8 source/trigger drift' USING ERRCODE='55000'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('issue333-pilot8-controller',3338));
 SELECT * INTO au FROM auth.users WHERE id=u FOR UPDATE;
 SELECT * INTO pr FROM public.profiles WHERE id=u FOR UPDATE;
 PERFORM id FROM public.user_roles WHERE user_id=u ORDER BY id FOR UPDATE;
 SELECT * INTO ur FROM public.user_roles WHERE id=r AND user_id=u AND company_id=c AND role='user';
 PERFORM 1 FROM public.companies WHERE id=c AND status='active' FOR SHARE;
 IF NOT FOUND OR au.id IS NULL OR pr.id IS NULL OR ur.id IS NULL OR
 au.email IS DISTINCT FROM p->>'email' OR au.created_at IS DISTINCT FROM (p->>'created_at')::timestamptz OR
 au.created_at > (p->>'window_start')::timestamptz OR
 au.email_confirmed_at IS NULL OR au.last_sign_in_at IS NOT NULL OR au.banned_until IS NOT NULL OR
 au.raw_user_meta_data->>'fixture_marker' IS DISTINCT FROM p->>'fixture_marker' OR
 au.raw_user_meta_data->>'company_id' IS DISTINCT FROM c::text OR
 pr.company_id IS DISTINCT FROM c OR (pr.active_company_id IS NOT NULL AND pr.active_company_id IS DISTINCT FROM c) OR
 nullif(btrim(pr.full_name),'') IS NULL OR
 (SELECT count(*) FROM public.user_roles WHERE user_id=u)<>1 OR
 EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=u) OR
 EXISTS(SELECT 1 FROM public.data_entry_sessions WHERE owner_id=u) OR
 EXISTS(SELECT 1 FROM public.standalone_attempts_333 WHERE principal=u::text) OR
 EXISTS(SELECT 1 FROM public.standalone_invoices WHERE created_by=u OR (company_id=c AND invoice_number=p->>'invoice_number')) OR
 EXISTS(SELECT 1 FROM public.data_entry_results WHERE approved_by=u) OR
 EXISTS(SELECT 1 FROM public.data_entry_pilot8_allowlist WHERE enabled) OR
 EXISTS(SELECT 1 FROM public.data_entry_settings WHERE execute_validated OR preparation_validated) OR
 EXISTS(SELECT 1 FROM public.standalone_attempt_settings_333 WHERE enabled)
 THEN RAISE EXCEPTION 'pilot8 fresh identity/context/closed flags refused' USING ERRCODE='42501'; END IF;
 -- Evaluate the REAL canonical resolver without login, profile writes or an admin session.
 -- These local claims are only context for this SELECT, never authentication proof.
 prior_sub:=current_setting('request.jwt.claim.sub',true); prior_claims:=current_setting('request.jwt.claims',true);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u)::text,true);
 canonical:=public.current_company_id();
 PERFORM set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);
 PERFORM set_config('request.jwt.claims',coalesce(prior_claims,''),true);
 IF canonical IS DISTINCT FROM c THEN RAISE EXCEPTION 'pilot8 canonical company refused' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO audit_before FROM public.system_audit_log WHERE entity_type='user_roles' AND entity_id=r::text;
 UPDATE public.user_roles SET role='manager'::public.app_role WHERE id=r AND user_id=u AND company_id=c AND role='user'::public.app_role;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'pilot8 role ROW_COUNT != 1' USING ERRCODE='55000'; END IF;
 IF (SELECT count(*) FROM public.system_audit_log WHERE entity_type='user_roles' AND entity_id=r::text)<>audit_before+1 OR
 NOT EXISTS(SELECT 1 FROM public.system_audit_log WHERE entity_type='user_roles' AND entity_id=r::text AND action='update' AND company_id=c
 AND changed_by=coalesce(auth.uid()::text,'system') AND metadata=jsonb_build_object('schema','public','op','UPDATE')
 AND old_data=to_jsonb(ur) AND new_data=to_jsonb(ur)||jsonb_build_object('role','manager'))
 THEN RAISE EXCEPTION 'pilot8 real role audit missing' USING ERRCODE='55000'; END IF;
 expiry:=clock_timestamp()+interval '10 minutes';
 INSERT INTO public.data_entry_pilot8_allowlist(owner_id,company_id,operation,enabled,expires_at,reviewed_note)
 SELECT u,c,op,true,expiry,'FICTITIOUS one PDF; '||(p->>'fixture_marker')||'; SHA256='||(p->>'document_sha256')
 FROM unnest(ARRAY['preparation','assistant_create']) op;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>2 OR (SELECT count(*) FROM public.data_entry_pilot8_allowlist WHERE owner_id=u AND company_id=c AND enabled AND expires_at=expiry)<>2
 THEN RAISE EXCEPTION 'pilot8 allowlist ROW_COUNT != 2' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=u) OR EXISTS(SELECT 1 FROM public.data_entry_settings WHERE execute_validated OR preparation_validated)
 OR EXISTS(SELECT 1 FROM public.standalone_attempt_settings_333 WHERE enabled)
 THEN RAISE EXCEPTION 'pilot8 final closed flags/session guard' USING ERRCODE='55000'; END IF;
END $pilot$;
COMMIT;
