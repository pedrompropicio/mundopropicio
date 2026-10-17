-- #333 Assistente de Entrada de Dados — migração técnica ADITIVA. PENDENTE: NÃO aplicar.
-- Provas: docs/testes/issue333/04-postgres-real-duas-conexoes.md
-- Identidade/empresa/papel: auth.uid() + public.current_company_id() + public._effective_permissions_for()
-- (helpers canónicos, não alterados). Nenhuma tabela técnica é acessível directamente por authenticated.
-- Execução fechada por data_entry_settings.execute_validated (sem linha = indisponível).
-- Moeda: só EUR nesta versão (câmbio exige fonte servidor congelada — pendente).

CREATE TABLE public.data_entry_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id),
 owner_id uuid NOT NULL REFERENCES public.profiles(id), event_id uuid REFERENCES public.events(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.data_entry_storage_receipts (
 bucket text NOT NULL CHECK(bucket IN ('data-entry-staging','standalone-invoices')), path text NOT NULL,
 company_id uuid NOT NULL REFERENCES public.companies(id), sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 20971520), mime text NOT NULL CHECK(mime IN ('application/pdf','image/jpeg','image/png')),
 verified_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(bucket,path)
);
CREATE TABLE public.data_entry_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.data_entry_sessions(id), company_id uuid NOT NULL REFERENCES public.companies(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 255), path text NOT NULL UNIQUE,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 20971520),
 mime text NOT NULL CHECK(mime IN ('application/pdf','image/jpeg','image/png')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,sha256)
);
CREATE TABLE public.data_entry_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.data_entry_sessions(id),
 company_id uuid NOT NULL REFERENCES public.companies(id), author_id uuid NOT NULL REFERENCES public.profiles(id),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.data_entry_previews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.data_entry_sessions(id), company_id uuid NOT NULL REFERENCES public.companies(id),
 document_id uuid NOT NULL REFERENCES public.data_entry_documents(id), version integer NOT NULL, created_by uuid NOT NULL REFERENCES public.profiles(id),
 operation text NOT NULL CHECK(operation='standalone_invoice_v1'), snapshot jsonb NOT NULL, snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 destination_id uuid NOT NULL DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,version)
);
CREATE TABLE public.data_entry_results (
 preview_id uuid PRIMARY KEY REFERENCES public.data_entry_previews(id), company_id uuid NOT NULL REFERENCES public.companies(id),
 document_id uuid NOT NULL UNIQUE REFERENCES public.data_entry_documents(id), invoice_id uuid NOT NULL UNIQUE REFERENCES public.standalone_invoices(id),
 approved_by uuid NOT NULL REFERENCES public.profiles(id), approved_name text NOT NULL, approved_at timestamptz NOT NULL DEFAULT now(),
 snapshot_hash text NOT NULL, result jsonb NOT NULL
);
CREATE TABLE public.data_entry_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), execute_validated boolean NOT NULL DEFAULT false
);
-- No configuration row: execution unavailable by default.
DO $g$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['data_entry_sessions','data_entry_storage_receipts','data_entry_documents','data_entry_messages','data_entry_previews','data_entry_results','data_entry_settings'] LOOP
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
 END LOOP; END $g$;
CREATE INDEX data_entry_sessions_owner ON public.data_entry_sessions(company_id,owner_id,created_at DESC);
CREATE INDEX data_entry_messages_session ON public.data_entry_messages(session_id,created_at,id);
CREATE INDEX data_entry_previews_session ON public.data_entry_previews(session_id,version DESC);

-- Canonical actor: never accepts identity/company from the caller.
CREATE FUNCTION public.data_entry_actor(OUT uid uuid, OUT company uuid, OUT actor_name text, OUT actor_role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 uid := auth.uid(); company := public.current_company_id();
 IF uid IS NULL OR company IS NULL THEN RAISE EXCEPTION '#333: Sessão ou empresa ativa inválida' USING ERRCODE='42501'; END IF;
 actor_role := public._effective_permissions_for(uid, company, '{}'::text[])->>'role';
 IF actor_role IS NULL OR actor_role NOT IN ('platform_admin','admin','manager') THEN RAISE EXCEPTION '#333: Sem permissão nesta empresa' USING ERRCODE='42501'; END IF;
 SELECT nullif(btrim(full_name),'') INTO actor_name FROM public.profiles WHERE id = uid;
 IF actor_name IS NULL THEN RAISE EXCEPTION '#333: Perfil sem nome; não é possível registar a autorização' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.data_entry_actor() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.data_entry_own_session(p_session uuid, p_lock boolean DEFAULT false) RETURNS public.data_entry_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a record; v public.data_entry_sessions;
BEGIN
 a := public.data_entry_actor();
 IF p_lock THEN SELECT * INTO v FROM public.data_entry_sessions WHERE id=p_session AND owner_id=a.uid AND company_id=a.company FOR UPDATE;
 ELSE SELECT * INTO v FROM public.data_entry_sessions WHERE id=p_session AND owner_id=a.uid AND company_id=a.company; END IF;
 IF v.id IS NULL THEN RAISE EXCEPTION '#333: Lote indisponível nesta empresa' USING ERRCODE='42501'; END IF;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.data_entry_own_session(uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;

-- Service role only: the edge function records bytes it actually stored and verified.
CREATE FUNCTION public.data_entry_record_receipt(p_bucket text, p_path text, p_sha text, p_size integer, p_mime text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c uuid; r public.data_entry_storage_receipts;
BEGIN
 IF p_path !~ '^[0-9a-f-]{36}/' THEN RAISE EXCEPTION '#333: Caminho inválido' USING ERRCODE='22023'; END IF;
 c := split_part(p_path,'/',1)::uuid;
 INSERT INTO public.data_entry_storage_receipts(bucket,path,company_id,sha256,size_bytes,mime) VALUES(p_bucket,p_path,c,p_sha,p_size,p_mime) ON CONFLICT DO NOTHING;
 SELECT * INTO r FROM public.data_entry_storage_receipts WHERE bucket=p_bucket AND path=p_path;
 IF r.sha256<>p_sha OR r.size_bytes<>p_size OR r.mime<>p_mime THEN RAISE EXCEPTION '#333: Objeto já registado com outro conteúdo' USING ERRCODE='23505'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.data_entry_record_receipt(text,text,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.data_entry_record_receipt(text,text,text,integer,text) TO service_role;

CREATE FUNCTION public.data_entry_session(p_session uuid DEFAULT NULL, p_event uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a record; v public.data_entry_sessions;
BEGIN
 a := public.data_entry_actor();
 IF p_session IS NULL THEN
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

CREATE FUNCTION public.data_entry_add_document(p_session uuid, p_name text, p_sha text, p_size integer, p_mime text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.data_entry_sessions; existing uuid; r uuid; p text;
BEGIN
 v := public.data_entry_own_session(p_session, true);
 p := v.company_id::text||'/'||v.id::text||'/'||p_sha;
 IF NOT EXISTS(SELECT 1 FROM public.data_entry_storage_receipts WHERE bucket='data-entry-staging' AND path=p AND company_id=v.company_id AND sha256=p_sha AND size_bytes=p_size AND mime=p_mime) THEN
  RAISE EXCEPTION '#333: Documento não conferido no armazenamento' USING ERRCODE='42501'; END IF;
 SELECT id INTO existing FROM public.data_entry_documents WHERE session_id=v.id AND sha256=p_sha;
 IF existing IS NOT NULL THEN RETURN jsonb_build_object('id',existing,'reused',true); END IF;
 IF (SELECT count(*) FROM public.data_entry_documents WHERE session_id=v.id)>=20 THEN RAISE EXCEPTION '#333: Máximo 20 documentos por lote' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.data_entry_documents(session_id,company_id,name,path,sha256,size_bytes,mime) VALUES(v.id,v.company_id,left(btrim(p_name),255),p,p_sha,p_size,p_mime) RETURNING id INTO r;
 RETURN jsonb_build_object('id',r,'reused',false);
END $$;

CREATE FUNCTION public.data_entry_note(p_session uuid, p_body text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.data_entry_sessions; r uuid;
BEGIN
 v := public.data_entry_own_session(p_session, true);
 IF p_body IS NULL OR length(btrim(p_body)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION '#333: Nota inválida' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM public.data_entry_messages WHERE session_id=v.id)>=200 THEN RAISE EXCEPTION '#333: Limite de notas do lote' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.data_entry_messages(session_id,company_id,author_id,body) VALUES(v.id,v.company_id,auth.uid(),btrim(p_body)) RETURNING id INTO r;
 RETURN r;
END $$;

CREATE FUNCTION public.data_entry_norm(t text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS
$$ SELECT upper(regexp_replace(coalesce(t,''),'[^A-Za-z0-9]','','g')) $$;
REVOKE ALL ON FUNCTION public.data_entry_norm(text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.data_entry_prepare(p_session uuid, p_document uuid, p_fields jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.data_entry_sessions; d public.data_entry_documents; v public.data_entry_previews; a record;
 n integer; snap jsonb; payer uuid; payer_name text; company_tax text; total numeric; vat numeric; day date; k text;
 required text[] := ARRAY['supplier_name','supplier_nif','invoice_number','invoice_date','currency','total_amount','iva_amount','paid_by_partner_id','customer_nif','notes'];
BEGIN
 a := public.data_entry_actor();
 s := public.data_entry_own_session(p_session, true);
 SELECT * INTO d FROM public.data_entry_documents WHERE id=p_document AND session_id=s.id;
 IF d.id IS NULL THEN RAISE EXCEPTION '#333: Documento inválido' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.data_entry_results WHERE document_id=d.id) THEN RAISE EXCEPTION '#333: Documento já registado; consulta o resultado' USING ERRCODE='23505'; END IF;
 IF jsonb_typeof(p_fields) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION '#333: Campos inválidos' USING ERRCODE='22023'; END IF;
 FOR k IN SELECT jsonb_object_keys(p_fields) LOOP IF NOT k = ANY(required) THEN RAISE EXCEPTION '#333: Campo não permitido' USING ERRCODE='22023'; END IF; END LOOP;
 FOREACH k IN ARRAY required LOOP
  IF NOT p_fields ? k OR jsonb_typeof(p_fields->k) <> (CASE WHEN k IN ('total_amount','iva_amount') THEN 'number' ELSE 'string' END) THEN RAISE EXCEPTION '#333: Campo % em falta ou com tipo errado', k USING ERRCODE='22023'; END IF;
 END LOOP;
 IF length(btrim(p_fields->>'supplier_name')) NOT BETWEEN 1 AND 200 OR length(public.data_entry_norm(p_fields->>'supplier_nif')) NOT BETWEEN 5 AND 40
  OR length(btrim(p_fields->>'invoice_number')) NOT BETWEEN 1 AND 100 OR length(p_fields->>'notes')>2000 THEN RAISE EXCEPTION '#333: Confirma fornecedor, NIF, número e nota' USING ERRCODE='22023'; END IF;
 IF p_fields->>'currency' <> 'EUR' THEN RAISE EXCEPTION '#333: Só EUR nesta versão; outras moedas indisponíveis' USING ERRCODE='22023'; END IF;
 IF (p_fields->>'invoice_date') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION '#333: Data civil inválida' USING ERRCODE='22023'; END IF;
 BEGIN day := (p_fields->>'invoice_date')::date; EXCEPTION WHEN others THEN RAISE EXCEPTION '#333: Data civil inválida' USING ERRCODE='22023'; END;
 IF to_char(day,'YYYY-MM-DD') <> p_fields->>'invoice_date' THEN RAISE EXCEPTION '#333: Data civil inválida' USING ERRCODE='22023'; END IF;
 total := (p_fields->>'total_amount')::numeric; vat := (p_fields->>'iva_amount')::numeric;
 IF total<0 OR vat<0 OR vat>total OR total>99999999.99 OR round(total,2)<>total OR round(vat,2)<>vat THEN RAISE EXCEPTION '#333: Valores inválidos' USING ERRCODE='22023'; END IF;
 IF (p_fields->>'paid_by_partner_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION '#333: Pagador inválido' USING ERRCODE='22023'; END IF;
 payer := (p_fields->>'paid_by_partner_id')::uuid;
 SELECT nullif(btrim(pr.full_name),'') INTO payer_name FROM public.profiles pr WHERE pr.id=payer AND EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=payer AND ur.company_id=s.company_id);
 IF payer_name IS NULL THEN RAISE EXCEPTION '#333: Confirma um pagador membro desta empresa' USING ERRCODE='22023'; END IF;
 SELECT tax_id INTO company_tax FROM public.companies WHERE id=s.company_id;
 IF public.data_entry_norm(company_tax)='' OR public.data_entry_norm(company_tax)<>public.data_entry_norm(p_fields->>'customer_nif') THEN RAISE EXCEPTION '#333: NIF do destinatário não corresponde à empresa' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.standalone_invoices WHERE company_id=s.company_id AND public.data_entry_norm(supplier_nif)=public.data_entry_norm(p_fields->>'supplier_nif') AND public.data_entry_norm(invoice_number)=public.data_entry_norm(p_fields->>'invoice_number')) THEN
  RAISE EXCEPTION '#333: Fatura já existe no ERP; nenhuma nova ação' USING ERRCODE='23505'; END IF;
 SELECT coalesce(max(version),0)+1 INTO n FROM public.data_entry_previews WHERE session_id=s.id;
 snap := jsonb_build_object('schema_version',2,'operation','standalone_invoice_v1','company_id',s.company_id,'company_tax',company_tax,'event_id',s.event_id,
  'prepared_by',a.uid,'version',n,'document',jsonb_build_object('id',d.id,'path',d.path,'sha256',d.sha256,'mime',d.mime,'size_bytes',d.size_bytes,'name',d.name),
  'fields',jsonb_build_object('supplier_name',btrim(p_fields->>'supplier_name'),'supplier_nif',btrim(p_fields->>'supplier_nif'),'invoice_number',btrim(p_fields->>'invoice_number'),
    'invoice_date',p_fields->>'invoice_date','currency','EUR','total_amount',total,'iva_amount',vat,'paid_by_partner_id',payer,'customer_nif',btrim(p_fields->>'customer_nif'),'notes',p_fields->>'notes'),
  'payer_name',payer_name,'provenance','confirmed_by_user',
  'effects',jsonb_build_array('Criar 1 Fatura Avulsa (estado novo) com o documento anexado','Sem transação, BP, conta, lista de pagamento ou reembolso'));
 INSERT INTO public.data_entry_previews(session_id,company_id,document_id,version,created_by,operation,snapshot,snapshot_hash)
 VALUES(s.id,s.company_id,d.id,n,a.uid,'standalone_invoice_v1',snap,encode(extensions.digest(convert_to(snap::text,'UTF8'),'sha256'),'hex')) RETURNING * INTO v;
 RETURN to_jsonb(v);
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
 PERFORM pg_advisory_xact_lock(hashtextextended(s.company_id::text||'|'||public.data_entry_norm(f->>'supplier_nif')||'|'||public.data_entry_norm(f->>'invoice_number'),333));
 IF EXISTS(SELECT 1 FROM public.standalone_invoices WHERE company_id=s.company_id AND public.data_entry_norm(supplier_nif)=public.data_entry_norm(f->>'supplier_nif') AND public.data_entry_norm(invoice_number)=public.data_entry_norm(f->>'invoice_number')) THEN
  RAISE EXCEPTION '#333: Fatura já existe no ERP; nenhuma nova ação' USING ERRCODE='23505'; END IF;
 mark := 'Feito por LLM com autorização de '||a.actor_name||' em '||to_char(now_ts AT TIME ZONE 'Europe/Lisbon','DD/MM/YYYY')||'.';
 INSERT INTO public.standalone_invoices(id,company_id,storage_path,file_name,supplier_name,supplier_nif,invoice_number,invoice_date,currency,original_amount,fx_rate,fx_rate_source,total_amount,iva_amount,paid_by_partner_id,notes,status,created_by)
 VALUES(v.destination_id,s.company_id,final_path,d.name,f->>'supplier_name',f->>'supplier_nif',f->>'invoice_number',(f->>'invoice_date')::date,'EUR',NULL,NULL,NULL,(f->>'total_amount')::numeric,(f->>'iva_amount')::numeric,(f->>'paid_by_partner_id')::uuid,concat_ws(E'\n',nullif(btrim(f->>'notes'),''),mark),'new',a.uid);
 output := jsonb_build_object('invoice_id',v.destination_id,'preview_id',v.id,'document_id',d.id,'path',final_path,'sha256',d.sha256,'status','new',
  'total_amount',(f->>'total_amount')::numeric,'iva_amount',(f->>'iva_amount')::numeric,'invoice_date',f->>'invoice_date','supplier_nif',f->>'supplier_nif','invoice_number',f->>'invoice_number',
  'approved_by',a.uid,'approved_name',a.actor_name,'approved_at',now_ts,'observation',mark);
 INSERT INTO public.data_entry_results(preview_id,company_id,document_id,invoice_id,approved_by,approved_name,approved_at,snapshot_hash,result)
 VALUES(v.id,s.company_id,d.id,v.destination_id,a.uid,a.actor_name,now_ts,v.snapshot_hash,output);
 RETURN output;
END $$;

-- Conferência: compares the persisted invoice with the authorised snapshot (not a cache echo).
CREATE FUNCTION public.data_entry_result_check(p_preview uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.data_entry_results; v public.data_entry_previews; i public.standalone_invoices; f jsonb; ok boolean;
BEGIN
 SELECT * INTO v FROM public.data_entry_previews WHERE id=p_preview;
 PERFORM public.data_entry_own_session(v.session_id);
 SELECT * INTO r FROM public.data_entry_results WHERE preview_id=p_preview;
 IF r.preview_id IS NULL THEN RAISE EXCEPTION '#333: Sem resultado para esta prévia' USING ERRCODE='P0001'; END IF;
 SELECT * INTO i FROM public.standalone_invoices WHERE id=r.invoice_id AND company_id=r.company_id;
 f := v.snapshot->'fields';
 ok := i.id IS NOT NULL AND i.storage_path=r.result->>'path' AND i.total_amount=(f->>'total_amount')::numeric AND i.iva_amount=(f->>'iva_amount')::numeric
  AND i.invoice_date=(f->>'invoice_date')::date AND i.supplier_nif=f->>'supplier_nif' AND i.invoice_number=f->>'invoice_number' AND i.currency='EUR'
  AND i.paid_by_partner_id=(f->>'paid_by_partner_id')::uuid AND i.created_by=r.approved_by AND position(r.result->>'observation' in coalesce(i.notes,''))>0;
 RETURN jsonb_build_object('ok',ok,'result',r.result,'path',r.result->>'path','sha256',r.result->>'sha256',
  'persisted',CASE WHEN i.id IS NULL THEN NULL ELSE jsonb_build_object('id',i.id,'status',i.status,'total_amount',i.total_amount,'invoice_date',i.invoice_date,'storage_path',i.storage_path) END);
END $$;

DO $g$ DECLARE fn text; BEGIN
 FOREACH fn IN ARRAY ARRAY['data_entry_session(uuid,uuid)','data_entry_add_document(uuid,text,text,integer,text)','data_entry_note(uuid,text)',
  'data_entry_prepare(uuid,uuid,jsonb)','data_entry_commit(uuid,text)','data_entry_result_check(uuid)'] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
 END LOOP; END $g$;

CREATE FUNCTION public.data_entry_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION '#333: Registo técnico imutável'; END $$;
REVOKE ALL ON FUNCTION public.data_entry_immutable() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER data_entry_receipts_immutable BEFORE UPDATE OR DELETE ON public.data_entry_storage_receipts FOR EACH ROW EXECUTE FUNCTION public.data_entry_immutable();
CREATE TRIGGER data_entry_documents_immutable BEFORE UPDATE OR DELETE ON public.data_entry_documents FOR EACH ROW EXECUTE FUNCTION public.data_entry_immutable();
CREATE TRIGGER data_entry_previews_immutable BEFORE UPDATE OR DELETE ON public.data_entry_previews FOR EACH ROW EXECUTE FUNCTION public.data_entry_immutable();
CREATE TRIGGER data_entry_results_immutable BEFORE UPDATE OR DELETE ON public.data_entry_results FOR EACH ROW EXECUTE FUNCTION public.data_entry_immutable();
