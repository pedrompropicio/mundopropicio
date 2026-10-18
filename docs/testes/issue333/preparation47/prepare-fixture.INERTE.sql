-- INERTE: controller query_database only, after review. NEVER a schema migration.
-- Replace the ONE JSON literal __PARAMETERS_JSON__ with JSON serialized by a trusted runner.
-- Parameters: company_id, owner_id, role_id, attempt_id, destination_id, email,
-- created_at (exact AuthAdmin returned timestamp), window_start, window_end, fixture_marker.
-- IDs/timestamps/email/marker are private /tmp only. No password/JWT in this SQL.
BEGIN;
DO $fixture333$
DECLARE
 p jsonb := '__PARAMETERS_JSON__'::jsonb;
 c uuid := (p->>'company_id')::uuid; u uuid := (p->>'owner_id')::uuid;
 r uuid := (p->>'role_id')::uuid; a uuid := (p->>'attempt_id')::uuid;
 d uuid := (p->>'destination_id')::uuid;
 e jsonb; h text; object_path text; n integer; audit_before bigint;
 au auth.users; pr public.profiles; ur public.user_roles;
 row_after public.standalone_attempts_333;
 doc_hash constant text := '71f5e44dc5b441804eb07ab099b006d4fb119f5c9b86f82b9645492ce711670a';
BEGIN
 IF c IS NULL OR u IS NULL OR r IS NULL OR a IS NULL OR d IS NULL OR
    u=a OR u=d OR a=d OR coalesce(p->>'email','') !~ '^issue333-[a-z0-9-]+@[^@]+\.invalid$' OR
    coalesce(p->>'fixture_marker','') !~ '^issue333-hash-check-[a-f0-9]{32}$' OR
    p->>'created_at' IS NULL OR p->>'window_start' IS NULL OR p->>'window_end' IS NULL OR
    (p->>'window_end')::timestamptz <= (p->>'window_start')::timestamptz OR
    (p->>'window_end')::timestamptz-(p->>'window_start')::timestamptz > interval '15 minutes' OR
    now() NOT BETWEEN (p->>'window_start')::timestamptz AND (p->>'window_end')::timestamptz
 THEN RAISE EXCEPTION 'fixture333 parameters/window refused' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=c AND status='active') OR
    EXISTS(SELECT 1 FROM public.standalone_attempt_settings_333 WHERE enabled) OR
    EXISTS(SELECT 1 FROM public.data_entry_settings) THEN
  RAISE EXCEPTION 'fixture333 company/settings refused' USING ERRCODE='42501'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.standalone_attempt_internal_333(text,uuid,text,jsonb,text,uuid,boolean)'::regprocedure)
    IS DISTINCT FROM 'b748a720b4cb1f988a927b5577e511dd' OR
    (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.log_table_change()'::regprocedure)
    IS DISTINCT FROM '68eb6557eb78e71984b5fb65fae9752e' OR
    NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.user_roles'::regclass AND tgname='audit_user_roles_changes'
      AND tgfoid='public.log_table_change()'::regprocedure AND tgenabled='O' AND tgtype=29 AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'fixture333 exact source/audit trigger refused' USING ERRCODE='55000'; END IF;
 -- Lock canonical rows, never create/reopen an identity or change its profile.
 SELECT * INTO au FROM auth.users WHERE id=u FOR UPDATE;
 SELECT * INTO pr FROM public.profiles WHERE id=u FOR UPDATE;
 PERFORM id FROM public.user_roles WHERE user_id=u FOR UPDATE;
 SELECT * INTO ur FROM public.user_roles WHERE id=r AND user_id=u AND company_id=c AND role='user';
 IF au.id IS NULL OR pr.id IS NULL OR ur.id IS NULL OR
    au.email IS DISTINCT FROM p->>'email' OR au.created_at IS DISTINCT FROM (p->>'created_at')::timestamptz OR
    au.created_at NOT BETWEEN (p->>'window_start')::timestamptz AND (p->>'window_end')::timestamptz OR
    (au.banned_until IS NOT NULL AND au.banned_until>now()) OR au.last_sign_in_at IS NOT NULL OR
    au.email_confirmed_at IS NULL OR
    au.raw_user_meta_data->>'fixture_marker' IS DISTINCT FROM p->>'fixture_marker' OR
    au.raw_user_meta_data->>'company_id' IS DISTINCT FROM c::text OR
    pr.company_id IS DISTINCT FROM c OR (pr.active_company_id IS NOT NULL AND pr.active_company_id<>c) OR
    (SELECT count(*) FROM public.user_roles WHERE user_id=u)<>1 OR
    EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=u) OR
    EXISTS(SELECT 1 FROM public.standalone_attempts_333 WHERE principal=u::text OR id=a OR destination_id=d) OR
    EXISTS(SELECT 1 FROM public.standalone_invoices WHERE id=d OR created_by=u)
 THEN RAISE EXCEPTION 'fixture333 new identity/provenance refused' USING ERRCODE='42501'; END IF;
 e:=jsonb_build_object('payload',jsonb_build_object('currency','EUR','total_amount',0,'iva_amount',0,
    'file_name','synthetic-proof39.pdf','notes','Synthetic document. Not an invoice.','created_by',u::text),
    'document',jsonb_build_object('sha256',doc_hash,'size_bytes',1499,'mime','application/pdf'),
    'effects',jsonb_build_array('scanner_create'));
 h:=encode(extensions.digest(convert_to(e::text,'UTF8'),'sha256'),'hex');
 object_path:=c::text||'/attempt333/'||a::text||'/'||doc_hash||'.pdf';
 PERFORM pg_advisory_xact_lock(hashtextextended(c::text||u::text||'scanner_create'||h,3331));
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='standalone-invoices' AND name=object_path) OR
    EXISTS(SELECT 1 FROM public.data_entry_storage_receipts WHERE path=object_path) OR
    EXISTS(SELECT 1 FROM public.standalone_attempt_audit_333 WHERE attempt_id=a)
 THEN RAISE EXCEPTION 'fixture333 existing effect refused' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO audit_before FROM public.system_audit_log WHERE entity_type='user_roles' AND entity_id=r::text;
 UPDATE public.user_roles SET role='editor'::public.app_role
 WHERE id=r AND user_id=u AND company_id=c AND role='user'::public.app_role;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'fixture333 role rowcount != 1' USING ERRCODE='55000'; END IF;
 IF (SELECT count(*) FROM public.system_audit_log WHERE entity_type='user_roles' AND entity_id=r::text)<>audit_before+1 OR
    NOT EXISTS(SELECT 1 FROM public.system_audit_log WHERE entity_type='user_roles' AND entity_id=r::text
      AND action='update' AND old_data=to_jsonb(ur) AND new_data=to_jsonb(ur)||jsonb_build_object('role','editor'))
 THEN RAISE EXCEPTION 'fixture333 administrative audit missing' USING ERRCODE='55000'; END IF;
 INSERT INTO public.standalone_attempts_333
  (id,company_id,principal,operation,envelope,envelope_hash,state,review_reason,intent_seq,
   prior_attempt_id,intent_confirmed_at,intent_confirmation_hash,destination_id,path,original_result,created_at,completed_at)
 VALUES(a,c,u::text,'scanner_create',e,h,'prepare',NULL,1,NULL,NULL,NULL,d,object_path,NULL,now(),NULL)
 RETURNING * INTO row_after;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 OR row_after.envelope<>e OR row_after.envelope_hash<>h OR row_after.state<>'prepare'
 THEN RAISE EXCEPTION 'fixture333 attempt rowcount/content refused' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM public.standalone_invoices WHERE id=d) OR
    EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='standalone-invoices' AND name=object_path) OR
    EXISTS(SELECT 1 FROM public.data_entry_storage_receipts WHERE path=object_path) OR
    EXISTS(SELECT 1 FROM public.standalone_attempt_audit_333 WHERE attempt_id=a)
 THEN RAISE EXCEPTION 'fixture333 effect detected' USING ERRCODE='55000'; END IF;
END $fixture333$;
COMMIT;
-- Controller reads the row/hash afterwards using the exact private attempt_id; no retry on uncertainty.
