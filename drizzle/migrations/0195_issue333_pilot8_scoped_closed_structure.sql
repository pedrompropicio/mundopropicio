-- INERTE: local/review ONLY. Never apply automatically. No activation rows.
-- Pilot replaces global enablement with an exact caller/company/operation allowlist.
DO $guard$ BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.data_entry_preparation_gate()'::regprocedure) IS DISTINCT FROM 'c5da8e899cc40981052eb49dff25a1df' THEN RAISE EXCEPTION 'pilot8 source changed: data_entry_preparation_gate' USING ERRCODE='55000'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.data_entry_session(uuid,uuid)'::regprocedure) IS DISTINCT FROM '1e53066070f9af824100b3093b613a06' THEN RAISE EXCEPTION 'pilot8 source changed: data_entry_session' USING ERRCODE='55000'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.data_entry_commit(uuid,text)'::regprocedure) IS DISTINCT FROM '2d8adf45d14f6a6f29b182678dc5e507' THEN RAISE EXCEPTION 'pilot8 source changed: data_entry_commit' USING ERRCODE='55000'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.standalone_attempt_gate_333(text)'::regprocedure) IS DISTINCT FROM 'bf40deac999b96d6f755a1d7aac37a8f' THEN RAISE EXCEPTION 'pilot8 source changed: standalone_attempt_gate_333' USING ERRCODE='55000'; END IF;
END $guard$;
CREATE TABLE public.data_entry_pilot8_allowlist (
 owner_id uuid NOT NULL REFERENCES public.profiles(id), company_id uuid NOT NULL REFERENCES public.companies(id),
 operation text NOT NULL CHECK(operation IN ('preparation','assistant_create')),
 enabled boolean NOT NULL DEFAULT false, expires_at timestamptz NOT NULL,
 reviewed_note text NOT NULL, PRIMARY KEY(owner_id,company_id,operation)
);
-- Owner-managed only; no Data API actor (including service) manages activation.
GRANT ALL ON public.data_entry_pilot8_allowlist TO postgres;
REVOKE ALL ON public.data_entry_pilot8_allowlist FROM PUBLIC,anon,authenticated,service_role;
DO $acl$ DECLARE g text; BEGIN
 FOR g IN SELECT DISTINCT r.rolname FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a JOIN pg_roles r ON r.oid=a.grantee WHERE c.oid='public.data_entry_pilot8_allowlist'::regclass AND a.grantee<>c.relowner LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.data_entry_pilot8_allowlist FROM %I',g);
 END LOOP;
END $acl$;
ALTER TABLE public.data_entry_pilot8_allowlist ENABLE ROW LEVEL SECURITY;
-- No policies: no browser/service access, same as existing settings.
CREATE FUNCTION public.data_entry_pilot8_gate(p_operation text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid(); c uuid:=public.current_company_id(); r text; permitted boolean:=false;
BEGIN
 IF u IS NULL OR c IS NULL OR p_operation NOT IN ('preparation','assistant_create') OR p_operation IS NULL THEN RETURN false; END IF;
 PERFORM 1 FROM public.profiles WHERE id=u FOR SHARE;
 PERFORM 1 FROM public.user_roles WHERE user_id=u ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.companies WHERE id=c FOR SHARE;
 IF public.current_company_id() IS DISTINCT FROM c THEN RETURN false; END IF;
 r:=public._effective_permissions_for(u,c,'{}'::text[])->>'role';
 IF coalesce(r,'') NOT IN ('admin','platform_admin','manager') OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=c AND status='active') THEN RETURN false; END IF;
 -- Shared lock prevents concurrent revocation overtaking this transaction's effect.
 SELECT enabled INTO permitted
 FROM public.data_entry_pilot8_allowlist WHERE owner_id=u AND company_id=c AND operation=p_operation FOR SHARE;
 RETURN coalesce(permitted,false) AND EXISTS(SELECT 1 FROM public.data_entry_pilot8_allowlist WHERE owner_id=u AND company_id=c AND operation=p_operation AND enabled AND expires_at>clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION public.data_entry_pilot8_gate(text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.data_entry_pilot8_capabilities() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a record;
BEGIN
 a:=public.data_entry_actor();
 RETURN jsonb_build_object('preparation',public.data_entry_pilot8_gate('preparation'),'execute',public.data_entry_pilot8_gate('assistant_create'));
END $$;
REVOKE ALL ON FUNCTION public.data_entry_pilot8_capabilities() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.data_entry_pilot8_capabilities() TO authenticated;

CREATE OR REPLACE FUNCTION public.data_entry_preparation_gate() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.data_entry_pilot8_gate('preparation') THEN
  RAISE EXCEPTION '#333: Preparação não validada; indisponível' USING ERRCODE='42501';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.data_entry_session(p_session uuid DEFAULT NULL, p_event uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a record; v public.data_entry_sessions;
BEGIN
 a := public.data_entry_actor();
 IF p_session IS NULL THEN
  PERFORM public.data_entry_preparation_gate();
  IF p_event IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.events WHERE id=p_event AND company_id=a.company) THEN RAISE EXCEPTION '#333: Evento de outra empresa' USING ERRCODE='42501'; END IF;
  INSERT INTO public.data_entry_sessions(company_id,owner_id,event_id) VALUES(a.company,a.uid,p_event) RETURNING * INTO v;
 ELSE v := public.data_entry_own_session(p_session); END IF;
 RETURN jsonb_build_object('session',to_jsonb(v),'actor',jsonb_build_object('name',a.actor_name,'role',a.actor_role),
 'company',(SELECT jsonb_build_object('id',id,'name',display_name,'tax_id',tax_id) FROM public.companies WHERE id=a.company),
 'event',(SELECT jsonb_build_object('id',id,'name',name) FROM public.events WHERE id=v.event_id),
 'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'path',path,'sha256',sha256,'size_bytes',size_bytes,'mime',mime,'created_at',created_at) ORDER BY created_at,id) FROM public.data_entry_documents WHERE session_id=v.id),'[]'),
 'messages',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'body',body,'created_at',created_at) ORDER BY created_at,id) FROM public.data_entry_messages WHERE session_id=v.id),'[]'),
 'preview',(SELECT to_jsonb(p) FROM public.data_entry_previews p WHERE session_id=v.id ORDER BY version DESC LIMIT 1),
 'results',coalesce((SELECT jsonb_agg(jsonb_build_object('preview_id',r.preview_id,'result',r.result)) FROM public.data_entry_results r JOIN public.data_entry_previews p ON p.id=r.preview_id WHERE p.session_id=v.id),'[]'),
 'payers',coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('id',pr.id,'name',pr.full_name)) FROM public.user_roles ur JOIN public.profiles pr ON pr.id=ur.user_id WHERE ur.company_id=a.company AND nullif(btrim(pr.full_name),'') IS NOT NULL),'[]'),
 'capabilities',jsonb_build_object('execute',public.data_entry_pilot8_gate('assistant_create')));
END $$;

CREATE OR REPLACE FUNCTION public.data_entry_commit(p_preview uuid, p_snapshot_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.data_entry_previews; s public.data_entry_sessions; d public.data_entry_documents; r public.data_entry_results; a record;
 f jsonb; mark text; final_path text; output jsonb; now_ts timestamptz := now();
BEGIN
 a := public.data_entry_actor();
 SELECT * INTO v FROM public.data_entry_previews WHERE id=p_preview;
 IF v.id IS NULL THEN RAISE EXCEPTION '#333: Prévia inexistente' USING ERRCODE='42501'; END IF;
 s := public.data_entry_own_session(v.session_id, true);  -- serialises executions of the same lote
 SELECT * INTO r FROM public.data_entry_results WHERE preview_id=v.id;
 IF r.preview_id IS NOT NULL THEN RETURN r.result; END IF;
 IF NOT public.data_entry_pilot8_gate('assistant_create') THEN RAISE EXCEPTION '#333: Execução não validada; indisponível' USING ERRCODE='42501'; END IF;
 IF v.snapshot_hash IS DISTINCT FROM p_snapshot_hash OR v.snapshot_hash <> encode(extensions.digest(convert_to(v.snapshot::text,'UTF8'),'sha256'),'hex') THEN RAISE EXCEPTION '#333: Autorização não corresponde à prévia' USING ERRCODE='40001'; END IF;
 IF v.version<>(SELECT max(version) FROM public.data_entry_previews WHERE session_id=s.id) THEN RAISE EXCEPTION '#333: Prévia alterada; autoriza a versão atual' USING ERRCODE='40001'; END IF;
 SELECT * INTO d FROM public.data_entry_documents WHERE id=v.document_id;
 IF v.snapshot->'document'->>'sha256' IS DISTINCT FROM d.sha256 OR v.snapshot->'document'->>'path' IS DISTINCT FROM d.path THEN RAISE EXCEPTION '#333: Documento alterado' USING ERRCODE='40001'; END IF;
 final_path := s.company_id::text||'/assistant333/'||d.id::text||'/'||d.sha256||(CASE d.mime WHEN 'application/pdf' THEN '.pdf' WHEN 'image/jpeg' THEN '.jpg' ELSE '.png' END);
 IF NOT EXISTS(SELECT 1 FROM public.data_entry_storage_receipts WHERE bucket='standalone-invoices' AND path=final_path AND company_id=s.company_id AND sha256=d.sha256 AND size_bytes=d.size_bytes AND mime=d.mime) THEN
  RAISE EXCEPTION '#333: Arquivo final não conferido' USING ERRCODE='40001'; END IF;
 f := v.snapshot->'fields';
 IF (SELECT tax_id FROM public.companies WHERE id=s.company_id) IS DISTINCT FROM v.snapshot->>'company_tax'
  OR (SELECT nullif(btrim(full_name),'') FROM public.profiles WHERE id=(f->>'paid_by_partner_id')::uuid) IS DISTINCT FROM v.snapshot->>'payer_name'
  OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=(f->>'paid_by_partner_id')::uuid AND company_id=s.company_id) THEN
  RAISE EXCEPTION '#333: Dados do ERP mudaram; prepara nova prévia' USING ERRCODE='40001'; END IF;
 -- Serialises #333 executors; legacy writers are guarded only by the canonical unique index (exact spelling).
 PERFORM pg_advisory_xact_lock(hashtextextended(s.company_id::text||'|'||public.data_entry_identity(f->>'supplier_nif')||'|'||public.data_entry_identity(f->>'invoice_number'),333));
 -- Revalidate after potentially waiting for the identity lock; expiration cannot authorize INSERT.
 a := public.data_entry_actor();
 IF a.company IS DISTINCT FROM s.company_id OR NOT public.data_entry_pilot8_gate('assistant_create') THEN RAISE EXCEPTION '#333: Piloto indisponível' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.standalone_invoices WHERE company_id=s.company_id AND public.data_entry_identity(supplier_nif)=public.data_entry_identity(f->>'supplier_nif') AND public.data_entry_identity(invoice_number)=public.data_entry_identity(f->>'invoice_number')) THEN
  RAISE EXCEPTION '#333: Fatura já existe no ERP; nenhuma nova ação' USING ERRCODE='23505'; END IF;
 mark := 'Feito por LLM com autorização de '||a.actor_name||' em '||to_char(now_ts AT TIME ZONE 'Europe/Lisbon','DD/MM/YYYY')||'.';
 INSERT INTO public.standalone_invoices(id,company_id,storage_path,file_name,supplier_name,supplier_nif,invoice_number,invoice_date,currency,original_amount,fx_rate,fx_rate_source,total_amount,iva_amount,paid_by_partner_id,notes,status,created_by)
 VALUES(v.destination_id,s.company_id,final_path,d.name,f->>'supplier_name',f->>'supplier_nif',f->>'invoice_number',(f->>'invoice_date')::date,'EUR',NULL,NULL,NULL,(f->>'total_amount')::numeric,(f->>'iva_amount')::numeric,(f->>'paid_by_partner_id')::uuid,concat_ws(E'\n',nullif(f->>'notes',''),mark),'new',a.uid);
 output := jsonb_build_object('invoice_id',v.destination_id,'preview_id',v.id,'document_id',d.id,'path',final_path,'sha256',d.sha256,'status','new',
  'total_amount',(f->>'total_amount')::numeric,'iva_amount',(f->>'iva_amount')::numeric,'invoice_date',f->>'invoice_date','supplier_nif',f->>'supplier_nif','invoice_number',f->>'invoice_number',
  'approved_by',a.uid,'approved_name',a.actor_name,'approved_at',now_ts,'observation',mark);
 INSERT INTO public.data_entry_results(preview_id,company_id,document_id,invoice_id,approved_by,approved_name,approved_at,snapshot_hash,result)
 VALUES(v.id,s.company_id,d.id,v.destination_id,a.uid,a.actor_name,now_ts,v.snapshot_hash,output);
 RETURN output;
END $$;

CREATE OR REPLACE FUNCTION public.standalone_attempt_gate_333(p_operation text) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p_operation='assistant_create' AND public.data_entry_pilot8_gate(p_operation)
$$;
DO $guard$ BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.data_entry_record_receipt(text,text,text,integer,text)'::regprocedure) IS DISTINCT FROM 'f7c560f3f7c22ffca897101b1d96c5d5' THEN RAISE EXCEPTION 'pilot8 receipt source changed' USING ERRCODE='55000'; END IF;
END $guard$;
CREATE FUNCTION public.data_entry_pilot8_receipt(p_owner uuid,p_company uuid,p_session uuid,p_bucket text,p_path text,p_sha text,p_size integer,p_mime text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.data_entry_sessions; d public.data_entry_documents; op text; permitted boolean; c uuid; pr public.profiles; pa boolean;
BEGIN
 IF p_owner IS NULL OR p_company IS NULL THEN RAISE EXCEPTION '#333: Contexto inválido' USING ERRCODE='42501'; END IF;
 SELECT * INTO pr FROM public.profiles WHERE id=p_owner;
 pa := public.is_platform_admin(p_owner);
 IF pr.active_company_id IS NOT NULL AND (pa OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_owner AND company_id=pr.active_company_id)) THEN c:=pr.active_company_id;
 ELSIF pr.company_id IS NOT NULL AND (pa OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_owner AND company_id=pr.company_id)) THEN c:=pr.company_id;
 ELSE SELECT ur.company_id INTO c FROM public.user_roles ur JOIN public.companies co ON co.id=ur.company_id WHERE ur.user_id=p_owner AND co.status='active' ORDER BY ur.id LIMIT 1; END IF;
 IF c IS DISTINCT FROM p_company OR coalesce(public._effective_permissions_for(p_owner,c,'{}'::text[])->>'role','') NOT IN ('admin','platform_admin','manager') OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=c AND status='active') THEN RAISE EXCEPTION '#333: Contexto alterado' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.data_entry_sessions WHERE id=p_session AND owner_id=p_owner AND company_id=c FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION '#333: Lote indisponível' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=p_owner FOR SHARE;
 PERFORM 1 FROM public.user_roles WHERE user_id=p_owner ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.companies WHERE id=c FOR SHARE;
 IF coalesce(public._effective_permissions_for(p_owner,c,'{}'::text[])->>'role','') NOT IN ('admin','platform_admin','manager') OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=c AND status='active') THEN RAISE EXCEPTION '#333: Contexto alterado' USING ERRCODE='42501'; END IF;
 SELECT * INTO pr FROM public.profiles WHERE id=p_owner;
 pa := public.is_platform_admin(p_owner);
 IF pr.active_company_id IS NOT NULL AND (pa OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_owner AND company_id=pr.active_company_id)) THEN c:=pr.active_company_id;
 ELSIF pr.company_id IS NOT NULL AND (pa OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_owner AND company_id=pr.company_id)) THEN c:=pr.company_id;
 ELSE SELECT ur.company_id INTO c FROM public.user_roles ur JOIN public.companies co ON co.id=ur.company_id WHERE ur.user_id=p_owner AND co.status='active' ORDER BY ur.id LIMIT 1; END IF;
 IF c IS DISTINCT FROM p_company THEN RAISE EXCEPTION '#333: Contexto alterado' USING ERRCODE='42501'; END IF;
 IF p_bucket='data-entry-staging' THEN
  op := 'preparation';
  IF p_path IS DISTINCT FROM s.company_id::text||'/'||s.id::text||'/'||p_sha THEN
   RAISE EXCEPTION '#333: Caminho inválido' USING ERRCODE='22023'; END IF;
 ELSIF p_bucket='standalone-invoices' THEN
  op := 'assistant_create';
  SELECT * INTO d FROM public.data_entry_documents WHERE session_id=s.id AND sha256=p_sha AND size_bytes=p_size AND mime=p_mime;
  IF d.id IS NULL OR p_path IS DISTINCT FROM s.company_id::text||'/assistant333/'||d.id::text||'/'||d.sha256||
   (CASE d.mime WHEN 'application/pdf' THEN '.pdf' WHEN 'image/jpeg' THEN '.jpg' ELSE '.png' END) THEN
   RAISE EXCEPTION '#333: Documento inválido' USING ERRCODE='22023'; END IF;
 ELSE RAISE EXCEPTION '#333: Destino inválido' USING ERRCODE='22023'; END IF;
 SELECT enabled INTO permitted FROM public.data_entry_pilot8_allowlist WHERE owner_id=p_owner AND company_id=c AND operation=op FOR SHARE;
 IF NOT coalesce(permitted,false) OR NOT EXISTS(SELECT 1 FROM public.data_entry_pilot8_allowlist WHERE owner_id=p_owner AND company_id=c AND operation=op AND enabled AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION '#333: Piloto indisponível' USING ERRCODE='42501'; END IF;
 PERFORM public.data_entry_record_receipt(p_bucket,p_path,p_sha,p_size,p_mime);
END $$;
REVOKE ALL ON FUNCTION public.data_entry_pilot8_receipt(uuid,uuid,uuid,text,text,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.data_entry_pilot8_receipt(uuid,uuid,uuid,text,text,text,integer,text) TO service_role;
-- New objects must not inherit executor/default grants; existing functions keep actual ACL intact.
DO $acl$ DECLARE f record; g text; BEGIN
 FOR f IN SELECT oid,oid::regprocedure::text signature,proowner FROM pg_proc WHERE oid IN ('public.data_entry_pilot8_gate(text)'::regprocedure,'public.data_entry_pilot8_capabilities()'::regprocedure,'public.data_entry_pilot8_receipt(uuid,uuid,uuid,text,text,text,integer,text)'::regprocedure) LOOP
  FOR g IN SELECT DISTINCT r.rolname FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a JOIN pg_roles r ON r.oid=a.grantee WHERE p.oid=f.oid AND a.grantee<>f.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.signature,g);
  END LOOP;
 END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION public.data_entry_pilot8_capabilities() TO authenticated;
GRANT EXECUTE ON FUNCTION public.data_entry_pilot8_receipt(uuid,uuid,uuid,text,text,text,integer,text) TO service_role;
