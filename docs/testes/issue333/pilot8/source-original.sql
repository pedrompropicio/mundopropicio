CREATE FUNCTION public.data_entry_preparation_gate() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT coalesce((SELECT preparation_validated FROM public.data_entry_settings WHERE singleton),false) THEN
  RAISE EXCEPTION '#333: Preparação não validada; indisponível' USING ERRCODE='42501';
 END IF;
END $$;

CREATE FUNCTION public.data_entry_session(p_session uuid DEFAULT NULL, p_event uuid DEFAULT NULL) RETURNS jsonb
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
 'capabilities',jsonb_build_object('execute',coalesce((SELECT execute_validated FROM public.data_entry_settings WHERE singleton),false)));
END $$;

CREATE FUNCTION public.data_entry_commit(p_preview uuid, p_snapshot_hash text) RETURNS jsonb
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
 IF NOT coalesce((SELECT execute_validated FROM public.data_entry_settings WHERE singleton),false) THEN RAISE EXCEPTION '#333: Execução não validada; indisponível' USING ERRCODE='42501'; END IF;
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

CREATE FUNCTION public.standalone_attempt_gate_333(p_operation text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT enabled FROM public.standalone_attempt_settings_333 WHERE operation=p_operation),false)
$$;
