-- #333 CANDIDATE ONLY. No migration/deploy/application authorized.
-- Requires reviewed #333 core/pgcrypto. No settings row or activation here.
CREATE TABLE public.standalone_attempts_333 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id),
 principal text NOT NULL, operation text NOT NULL CHECK(operation IN ('scanner_create','accountant_edit','ingest_create','assistant_create')),
 envelope jsonb NOT NULL, envelope_hash text NOT NULL CHECK(envelope_hash ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'prepare' CHECK(state IN ('prepare','authorized','inprogress','completed','review')),
 destination_id uuid NOT NULL, path text NOT NULL, original_result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(company_id,principal,operation,envelope_hash)
);
GRANT ALL ON public.standalone_attempts_333 TO service_role;
REVOKE ALL ON public.standalone_attempts_333 FROM PUBLIC,anon,authenticated;
ALTER TABLE public.standalone_attempts_333 ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.standalone_attempt_audit_333 (
 attempt_id uuid PRIMARY KEY REFERENCES public.standalone_attempts_333(id), company_id uuid NOT NULL,
 principal text NOT NULL, envelope_hash text NOT NULL, result jsonb NOT NULL, completed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.standalone_attempt_audit_333 TO service_role;
REVOKE ALL ON public.standalone_attempt_audit_333 FROM PUBLIC,anon,authenticated;
ALTER TABLE public.standalone_attempt_audit_333 ENABLE ROW LEVEL SECURITY;

-- Internal only. Trusted service context is passed only by service wrapper.
CREATE FUNCTION public.standalone_attempt_internal_333(
 p_action text,p_id uuid,p_operation text,p_envelope jsonb,p_hash text,p_company uuid,p_service boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c uuid; u uuid; principal_value text; role_value text; v public.standalone_attempts_333;
 h text; payload jsonb; before_row jsonb; current_row jsonb; expected_row jsonb; result_row jsonb;
 inv public.standalone_invoices; allowed text[]; key text; new_id uuid; ext text;
BEGIN
 IF p_service THEN
  c:=p_company; principal_value:='ingest_service';
  IF p_operation IS DISTINCT FROM 'ingest_create' THEN RAISE EXCEPTION '#333: Operação recusada' USING ERRCODE='42501'; END IF;
 ELSE
  u:=auth.uid(); c:=public.current_company_id(); principal_value:=u::text;
  IF u IS NULL OR c IS NULL THEN RAISE EXCEPTION '#333: Sessão inválida' USING ERRCODE='42501'; END IF;
  role_value:=public._effective_permissions_for(u,c,'{}'::text[])->>'role';
  IF p_operation NOT IN ('scanner_create','accountant_edit','assistant_create') OR p_operation IS NULL THEN RAISE EXCEPTION '#333: Operação recusada' USING ERRCODE='42501'; END IF;
  IF p_operation='assistant_create' AND coalesce(role_value,'') NOT IN ('admin','platform_admin','manager') THEN RAISE EXCEPTION '#333: Sem permissão' USING ERRCODE='42501'; END IF;
  IF p_operation='scanner_create' AND coalesce(role_value,'') NOT IN ('admin','platform_admin','manager','editor') THEN RAISE EXCEPTION '#333: Sem permissão' USING ERRCODE='42501'; END IF;
 END IF;
 IF c IS NULL OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=c AND status='active') THEN RAISE EXCEPTION '#333: Empresa indisponível' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('prepare','authorize','begin','commit','check') OR p_action IS NULL THEN RAISE EXCEPTION '#333: Ação recusada' USING ERRCODE='22023'; END IF;
 IF p_action='prepare' THEN
  IF jsonb_typeof(p_envelope) IS DISTINCT FROM 'object' OR
    (p_envelope - ARRAY['payload','document','effects','target','before']) <> '{}'::jsonb OR
    jsonb_typeof(p_envelope->'payload') IS DISTINCT FROM 'object' OR
    jsonb_typeof(p_envelope->'effects') IS DISTINCT FROM 'array' OR
    jsonb_typeof(p_envelope->'document') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION '#333: Envelope inválido' USING ERRCODE='22023'; END IF;
  payload:=p_envelope->'payload';
  allowed:=ARRAY['supplier_name','supplier_nif','invoice_number','invoice_date','currency','original_amount','fx_rate','fx_rate_source','total_amount','iva_amount','paid_by_partner_id','notes','file_name','created_by'];
  FOR key IN SELECT jsonb_object_keys(payload) LOOP
   IF NOT key=ANY(allowed) THEN RAISE EXCEPTION '#333: Campo recusado' USING ERRCODE='22023'; END IF;
   IF payload->key <> 'null'::jsonb AND jsonb_typeof(payload->key) <> CASE WHEN key IN ('original_amount','fx_rate','total_amount','iva_amount') THEN 'number' ELSE 'string' END THEN RAISE EXCEPTION '#333: Tipo inválido' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF payload->>'currency' IS NULL OR payload->>'currency' NOT IN ('EUR','USD','BRL','GBP') OR (p_operation='assistant_create' AND payload->>'currency'<>'EUR') THEN RAISE EXCEPTION '#333: Moeda inválida' USING ERRCODE='22023'; END IF;
  IF (payload->>'currency'<>'EUR' AND (payload->>'original_amount' IS NULL OR payload->>'fx_rate' IS NULL)) THEN RAISE EXCEPTION '#333: Câmbio não resolvido' USING ERRCODE='22023'; END IF;
  FOR key IN SELECT unnest(ARRAY['original_amount','fx_rate','total_amount','iva_amount']) LOOP
   IF payload->>key IS NOT NULL AND ((payload->>key)::numeric<0 OR (key IN ('total_amount','iva_amount','original_amount') AND round((payload->>key)::numeric,2)<>(payload->>key)::numeric) OR (key='fx_rate' AND (payload->>key)::numeric<=0)) THEN RAISE EXCEPTION '#333: Valor inválido' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF length(coalesce(payload->>'notes',''))>2000 OR length(coalesce(payload->>'file_name','')) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION '#333: Texto inválido' USING ERRCODE='22023'; END IF;
  IF payload->>'invoice_date' IS NOT NULL AND (payload->>'invoice_date' !~ '^\d{4}-\d{2}-\d{2}$' OR to_char((payload->>'invoice_date')::date,'YYYY-MM-DD')<>payload->>'invoice_date') THEN RAISE EXCEPTION '#333: Data inválida' USING ERRCODE='22023'; END IF;
  IF NOT p_service AND p_operation<>'accountant_edit' AND payload->>'created_by' IS DISTINCT FROM u::text THEN RAISE EXCEPTION '#333: Autor inválido' USING ERRCODE='42501'; END IF;
  IF (p_envelope->'document' - ARRAY['sha256','size_bytes','mime'])<>'{}'::jsonb OR jsonb_typeof(p_envelope->'document'->'sha256') IS DISTINCT FROM 'string' OR
    coalesce(p_envelope->'document'->>'sha256','') !~ '^[a-f0-9]{64}$' OR
    jsonb_typeof(p_envelope->'document'->'size_bytes') IS DISTINCT FROM 'number' OR
    (p_envelope->'document'->>'size_bytes')::numeric NOT BETWEEN 1 AND 20971520 OR
    (p_envelope->'document'->>'size_bytes')::numeric<>trunc((p_envelope->'document'->>'size_bytes')::numeric) OR
    coalesce(p_envelope->'document'->>'mime','') NOT IN ('application/pdf','image/png','image/jpeg') THEN RAISE EXCEPTION '#333: Documento inválido' USING ERRCODE='22023'; END IF;
  IF p_operation='accountant_edit' THEN
   SELECT * INTO inv FROM public.standalone_invoices WHERE id=(p_envelope->>'target')::uuid AND company_id=c;
   IF inv.id IS NULL OR (coalesce(role_value,'') NOT IN ('admin','platform_admin','accountant') AND inv.created_by IS DISTINCT FROM u) THEN RAISE EXCEPTION '#333: Edição recusada' USING ERRCODE='42501'; END IF;
   IF p_envelope->'before' IS DISTINCT FROM to_jsonb(inv) OR payload->>'created_by' IS DISTINCT FROM inv.created_by::text OR payload->>'file_name' IS DISTINCT FROM inv.file_name THEN RAISE EXCEPTION '#333: Versão anterior alterada' USING ERRCODE='40001'; END IF;
  ELSE
   IF p_envelope ? 'before' OR p_envelope ? 'target' THEN RAISE EXCEPTION '#333: Alvo inválido' USING ERRCODE='22023'; END IF;
  END IF;
  h:=encode(extensions.digest(convert_to(p_envelope::text,'UTF8'),'sha256'),'hex');
  -- Serialization across NEW IDs with identical envelopes, not document-only identity.
  PERFORM pg_advisory_xact_lock(hashtextextended(c::text||principal_value||p_operation||h,3331));
  IF p_id IS NOT NULL THEN
   SELECT * INTO v FROM public.standalone_attempts_333 WHERE id=p_id FOR UPDATE;
   IF v.id IS NOT NULL AND (v.company_id<>c OR v.principal<>principal_value OR v.operation<>p_operation OR v.envelope_hash<>h OR v.envelope<>p_envelope) THEN RAISE EXCEPTION '#333: Tentativa divergente' USING ERRCODE='42501'; END IF;
  END IF;
  IF v.id IS NULL THEN SELECT * INTO v FROM public.standalone_attempts_333 WHERE company_id=c AND principal=principal_value AND operation=p_operation AND envelope_hash=h FOR UPDATE; END IF;
  IF v.id IS NULL THEN
   new_id:=coalesce(p_id,gen_random_uuid());
   ext:=CASE p_envelope->'document'->>'mime' WHEN 'application/pdf' THEN '.pdf' WHEN 'image/png' THEN '.png' ELSE '.jpg' END;
   INSERT INTO public.standalone_attempts_333(id,company_id,principal,operation,envelope,envelope_hash,destination_id,path)
   VALUES(new_id,c,principal_value,p_operation,p_envelope,h,CASE WHEN p_operation='accountant_edit' THEN inv.id ELSE gen_random_uuid() END,
    CASE WHEN p_operation='accountant_edit' THEN inv.storage_path ELSE c::text||'/attempt333/'||new_id::text||'/'||(p_envelope->'document'->>'sha256')||ext END) RETURNING * INTO v;
  END IF;
 ELSE
  SELECT * INTO v FROM public.standalone_attempts_333 WHERE id=p_id FOR UPDATE;
  IF v.id IS NULL OR v.company_id<>c OR v.principal<>principal_value OR v.operation<>p_operation THEN RAISE EXCEPTION '#333: Tentativa indisponível' USING ERRCODE='42501'; END IF;
  IF p_hash IS DISTINCT FROM v.envelope_hash THEN RAISE EXCEPTION '#333: Hash divergente' USING ERRCODE='40001'; END IF;
  payload:=v.envelope->'payload';
  IF p_operation='accountant_edit' THEN
   SELECT * INTO inv FROM public.standalone_invoices WHERE id=v.destination_id AND company_id=c FOR UPDATE;
   IF inv.id IS NULL OR (coalesce(role_value,'') NOT IN ('admin','platform_admin','accountant') AND inv.created_by IS DISTINCT FROM u) THEN RAISE EXCEPTION '#333: Edição recusada' USING ERRCODE='42501'; END IF;
  END IF;
  IF p_action='authorize' AND v.state='prepare' THEN UPDATE public.standalone_attempts_333 SET state='authorized' WHERE id=v.id RETURNING * INTO v; END IF;
  IF p_action='begin' AND v.state='authorized' THEN UPDATE public.standalone_attempts_333 SET state='inprogress' WHERE id=v.id RETURNING * INTO v; END IF;
  IF p_action='commit' AND v.state<>'completed' THEN
   IF v.state<>'inprogress' THEN RAISE EXCEPTION '#333: Tentativa não autorizada' USING ERRCODE='42501'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.data_entry_storage_receipts WHERE bucket='standalone-invoices' AND path=v.path AND company_id=c AND sha256=v.envelope->'document'->>'sha256' AND size_bytes=(v.envelope->'document'->>'size_bytes')::integer AND mime=v.envelope->'document'->>'mime') THEN RAISE EXCEPTION '#333: Readback servidor pendente' USING ERRCODE='40001'; END IF;
   IF p_operation='accountant_edit' AND to_jsonb(inv) IS DISTINCT FROM v.envelope->'before' THEN
    UPDATE public.standalone_attempts_333 SET state='review' WHERE id=v.id RETURNING * INTO v;
   ELSE
    IF p_operation<>'accountant_edit' AND EXISTS(SELECT 1 FROM public.standalone_invoices WHERE id=v.destination_id) THEN RAISE EXCEPTION '#333: Destino ocupado sem auditoria' USING ERRCODE='40001'; END IF;
    -- Full row conversion validates UUID/date fields; only whitelisted fields are mutable.
    inv:=jsonb_populate_record(NULL::public.standalone_invoices,payload);
    IF p_operation='accountant_edit' THEN
     UPDATE public.standalone_invoices SET supplier_name=inv.supplier_name,supplier_nif=inv.supplier_nif,invoice_number=inv.invoice_number,invoice_date=inv.invoice_date,
      currency=inv.currency,original_amount=inv.original_amount,fx_rate=inv.fx_rate,fx_rate_source=inv.fx_rate_source,total_amount=inv.total_amount,iva_amount=inv.iva_amount,
      paid_by_partner_id=inv.paid_by_partner_id,notes=inv.notes WHERE id=v.destination_id AND company_id=c RETURNING to_jsonb(standalone_invoices.*) INTO result_row;
    ELSE
     INSERT INTO public.standalone_invoices(id,company_id,storage_path,file_name,supplier_name,supplier_nif,invoice_number,invoice_date,currency,original_amount,fx_rate,fx_rate_source,total_amount,iva_amount,paid_by_partner_id,notes,created_by,status)
     VALUES(v.destination_id,c,v.path,inv.file_name,inv.supplier_name,inv.supplier_nif,inv.invoice_number,inv.invoice_date,inv.currency,inv.original_amount,inv.fx_rate,inv.fx_rate_source,inv.total_amount,inv.iva_amount,inv.paid_by_partner_id,inv.notes,inv.created_by,'new') RETURNING to_jsonb(standalone_invoices.*) INTO result_row;
    END IF;
    INSERT INTO public.standalone_attempt_audit_333(attempt_id,company_id,principal,envelope_hash,result) VALUES(v.id,c,principal_value,v.envelope_hash,result_row);
    UPDATE public.standalone_attempts_333 SET state='completed',original_result=result_row,completed_at=now() WHERE id=v.id RETURNING * INTO v;
   END IF;
  END IF;
 END IF;
 SELECT to_jsonb(i.*) INTO current_row FROM public.standalone_invoices i WHERE id=v.destination_id AND company_id=c;
 RETURN jsonb_build_object('id',v.id,'hash',v.envelope_hash,'state',v.state,'path',v.path,'destination_id',v.destination_id,
  'result',v.original_result,'current',current_row,'document',v.envelope->'document',
  'record_ok',coalesce(v.state='completed' AND (current_row-ARRAY['status','processed_at','processed_by','updated_at'])=(v.original_result-ARRAY['status','processed_at','processed_by','updated_at']) AND
   EXISTS(SELECT 1 FROM public.standalone_attempt_audit_333 WHERE attempt_id=v.id AND envelope_hash=v.envelope_hash AND result=v.original_result),false));
END $$;
REVOKE ALL ON FUNCTION public.standalone_attempt_internal_333(text,uuid,text,jsonb,text,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.standalone_attempt_333(p_action text,p_id uuid,p_operation text,p_envelope jsonb,p_hash text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.standalone_attempt_internal_333(p_action,p_id,p_operation,p_envelope,p_hash,NULL,false)
$$;
REVOKE ALL ON FUNCTION public.standalone_attempt_333(text,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.standalone_attempt_333(text,uuid,text,jsonb,text) TO authenticated;
CREATE FUNCTION public.standalone_ingest_attempt_333(p_company uuid,p_action text,p_id uuid,p_envelope jsonb,p_hash text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.standalone_attempt_internal_333(p_action,p_id,'ingest_create',p_envelope,p_hash,p_company,true)
$$;
REVOKE ALL ON FUNCTION public.standalone_ingest_attempt_333(uuid,text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.standalone_ingest_attempt_333(uuid,text,uuid,jsonb,text) TO service_role;

CREATE FUNCTION public.standalone_attempt_guard_333() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION '#333: Candidato preservado'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','original_result','completed_at'])<>(to_jsonb(OLD)-ARRAY['state','original_result','completed_at']) THEN RAISE EXCEPTION '#333: Identidade imutável'; END IF;
 IF NOT ((OLD.state='prepare' AND NEW.state='authorized') OR (OLD.state='authorized' AND NEW.state='inprogress') OR (OLD.state='inprogress' AND NEW.state IN ('completed','review'))) THEN RAISE EXCEPTION '#333: Transição recusada'; END IF;
 IF NEW.state<>'completed' AND (NEW.original_result IS NOT NULL OR NEW.completed_at IS NOT NULL) THEN RAISE EXCEPTION '#333: Resultado prematuro'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.standalone_attempt_guard_333() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER standalone_attempt_guard_333 BEFORE UPDATE OR DELETE ON public.standalone_attempts_333 FOR EACH ROW EXECUTE FUNCTION public.standalone_attempt_guard_333();
CREATE TRIGGER standalone_attempt_audit_immutable_333 BEFORE UPDATE OR DELETE ON public.standalone_attempt_audit_333 FOR EACH ROW EXECUTE FUNCTION public.data_entry_immutable();