-- #333 experimental proposal ONLY. Not deploy-ready; do not apply.
-- Audit blockers: docs/testes/issue333/02-nucleo-isolado-e-bloqueios.md.
CREATE TABLE public.data_entry_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id),
 owner_id uuid NOT NULL REFERENCES public.profiles(id), event_id uuid REFERENCES public.events(id), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.data_entry_sessions TO service_role;
REVOKE ALL ON public.data_entry_sessions FROM PUBLIC,anon,authenticated;
ALTER TABLE public.data_entry_sessions ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.data_entry_documents (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES public.data_entry_sessions(id), company_id uuid NOT NULL REFERENCES public.companies(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 255), path text NOT NULL UNIQUE,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 20971520),
 mime text NOT NULL CHECK(mime IN ('application/pdf','image/jpeg','image/png')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,sha256)
);
GRANT ALL ON public.data_entry_documents TO service_role;
REVOKE ALL ON public.data_entry_documents FROM PUBLIC,anon,authenticated;
ALTER TABLE public.data_entry_documents ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.data_entry_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.data_entry_sessions(id),
 company_id uuid NOT NULL REFERENCES public.companies(id), author_id uuid NOT NULL REFERENCES public.profiles(id),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.data_entry_messages TO service_role;
REVOKE ALL ON public.data_entry_messages FROM PUBLIC,anon,authenticated;
ALTER TABLE public.data_entry_messages ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.data_entry_previews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.data_entry_sessions(id), company_id uuid NOT NULL REFERENCES public.companies(id),
 document_id uuid NOT NULL REFERENCES public.data_entry_documents(id), version integer NOT NULL,
 operation text NOT NULL CHECK(operation='standalone_invoice_v1'), snapshot jsonb NOT NULL, snapshot_hash text NOT NULL,
 destination_id uuid NOT NULL DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,version)
);
GRANT ALL ON public.data_entry_previews TO service_role;
REVOKE ALL ON public.data_entry_previews FROM PUBLIC,anon,authenticated;
ALTER TABLE public.data_entry_previews ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.data_entry_results (
 preview_id uuid PRIMARY KEY REFERENCES public.data_entry_previews(id), company_id uuid NOT NULL REFERENCES public.companies(id),
 document_id uuid NOT NULL UNIQUE REFERENCES public.data_entry_documents(id), invoice_id uuid NOT NULL UNIQUE REFERENCES public.standalone_invoices(id),
 approved_by uuid NOT NULL REFERENCES public.profiles(id), approved_name text NOT NULL, approved_at timestamptz NOT NULL DEFAULT now(),
 snapshot_hash text NOT NULL, result jsonb NOT NULL
);
GRANT ALL ON public.data_entry_results TO service_role;
REVOKE ALL ON public.data_entry_results FROM PUBLIC,anon,authenticated;
ALTER TABLE public.data_entry_results ENABLE ROW LEVEL SECURITY;
CREATE INDEX data_entry_sessions_owner ON public.data_entry_sessions(company_id,owner_id,created_at DESC);
CREATE INDEX data_entry_messages_session ON public.data_entry_messages(session_id,created_at,id);
CREATE INDEX data_entry_previews_session ON public.data_entry_previews(session_id,version DESC);

CREATE TABLE public.data_entry_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), execute_validated boolean NOT NULL DEFAULT false
);
GRANT ALL ON public.data_entry_settings TO service_role;
REVOKE ALL ON public.data_entry_settings FROM PUBLIC,anon,authenticated;
ALTER TABLE public.data_entry_settings ENABLE ROW LEVEL SECURITY;
-- No enabled configuration row. Execution is unavailable by default.

CREATE FUNCTION public.data_entry_assert(p_user uuid,p_company uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_name text; v_active uuid;
BEGIN
 SELECT full_name,coalesce(active_company_id,company_id) INTO v_name,v_active FROM public.profiles WHERE id=p_user FOR SHARE;
 IF p_user IS NULL OR v_active IS NULL OR v_active IS DISTINCT FROM p_company OR nullif(btrim(v_name),'') IS NULL THEN RAISE EXCEPTION 'Sessão ou empresa ativa inválida' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user AND (role='platform_admin' OR (company_id=p_company AND role IN ('admin','manager')))) THEN RAISE EXCEPTION 'Sem permissão nesta empresa' USING ERRCODE='42501'; END IF;
 RETURN v_name;
END $$;
REVOKE ALL ON FUNCTION public.data_entry_assert(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.data_entry_assert(uuid,uuid) TO service_role;

CREATE FUNCTION public.data_entry_session(p_user uuid,p_session uuid DEFAULT NULL,p_event uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.data_entry_sessions; c uuid;
BEGIN
 SELECT coalesce(active_company_id,company_id) INTO c FROM public.profiles WHERE id=p_user;
 PERFORM public.data_entry_assert(p_user,c);
 IF p_session IS NULL THEN
  IF p_event IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.events WHERE id=p_event AND company_id=c) THEN RAISE EXCEPTION 'Evento inválido' USING ERRCODE='42501'; END IF;
  INSERT INTO public.data_entry_sessions(company_id,owner_id,event_id) VALUES(c,p_user,p_event) RETURNING * INTO v;
 ELSE
  SELECT * INTO v FROM public.data_entry_sessions WHERE id=p_session AND owner_id=p_user AND company_id=c;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Lote indisponível' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN jsonb_build_object('session',to_jsonb(v),'company',(SELECT jsonb_build_object('id',id,'name',display_name,'tax_id',tax_id) FROM public.companies WHERE id=c),
 'documents',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY created_at,id) FROM public.data_entry_documents d WHERE session_id=v.id),'[]'),
 'messages',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY created_at,id) FROM public.data_entry_messages m WHERE session_id=v.id),'[]'),
 'preview',(SELECT to_jsonb(p) FROM public.data_entry_previews p WHERE session_id=v.id ORDER BY version DESC LIMIT 1),
 'results',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.data_entry_results r JOIN public.data_entry_previews p ON p.id=r.preview_id WHERE p.session_id=v.id),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.data_entry_session(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.data_entry_session(uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.data_entry_add_document(p_user uuid,p_session uuid,p_id uuid,p_name text,p_path text,p_sha text,p_size integer,p_mime text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.data_entry_sessions; existing uuid;
BEGIN
 SELECT * INTO v FROM public.data_entry_sessions WHERE id=p_session AND owner_id=p_user FOR UPDATE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'Lote inválido' USING ERRCODE='42501'; END IF;
 PERFORM public.data_entry_assert(p_user,v.company_id);
 IF p_path<>v.company_id::text||'/'||v.id::text||'/'||p_id::text THEN RAISE EXCEPTION 'Origem inválida'; END IF;
 SELECT id INTO existing FROM public.data_entry_documents WHERE session_id=v.id AND sha256=p_sha;
 IF existing IS NOT NULL THEN RETURN existing; END IF;
 IF (SELECT count(*) FROM public.data_entry_documents WHERE session_id=v.id)>=20 THEN RAISE EXCEPTION 'Máximo 20 documentos por lote'; END IF;
 IF EXISTS(SELECT 1 FROM public.data_entry_previews WHERE session_id=v.id) THEN RAISE EXCEPTION 'Inicia outro lote para adicionar documentos após a prévia'; END IF;
 INSERT INTO public.data_entry_documents(id,session_id,company_id,name,path,sha256,size_bytes,mime) VALUES(p_id,v.id,v.company_id,p_name,p_path,p_sha,p_size,p_mime);
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.data_entry_add_document(uuid,uuid,uuid,text,text,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.data_entry_add_document(uuid,uuid,uuid,text,text,text,integer,text) TO service_role;

CREATE FUNCTION public.data_entry_note(p_user uuid,p_session uuid,p_body text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.data_entry_sessions; r uuid;
BEGIN
 SELECT * INTO v FROM public.data_entry_sessions WHERE id=p_session AND owner_id=p_user FOR UPDATE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'Lote inválido' USING ERRCODE='42501'; END IF;
 PERFORM public.data_entry_assert(p_user,v.company_id);
 IF (SELECT count(*) FROM public.data_entry_messages WHERE session_id=v.id)>=200 THEN RAISE EXCEPTION 'Limite de mensagens do lote'; END IF;
 INSERT INTO public.data_entry_messages(session_id,company_id,author_id,body) VALUES(v.id,v.company_id,p_user,btrim(p_body)) RETURNING id INTO r;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.data_entry_note(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.data_entry_note(uuid,uuid,text) TO service_role;

CREATE FUNCTION public.data_entry_prepare(p_user uuid,p_session uuid,p_document uuid,p_fields jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.data_entry_sessions; d public.data_entry_documents; v public.data_entry_previews;
 n integer; snap jsonb; payer uuid; company_tax text; rate numeric; total numeric; vat numeric; original numeric; day date; ccy text; k text;
BEGIN
 SELECT * INTO s FROM public.data_entry_sessions WHERE id=p_session AND owner_id=p_user FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Lote inválido' USING ERRCODE='42501'; END IF;
 PERFORM public.data_entry_assert(p_user,s.company_id);
 SELECT * INTO d FROM public.data_entry_documents WHERE id=p_document AND session_id=s.id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Documento inválido'; END IF;
 IF EXISTS(SELECT 1 FROM public.data_entry_results WHERE document_id=d.id) THEN RAISE EXCEPTION 'Documento já registado; consultar resultado'; END IF;
 IF jsonb_typeof(p_fields) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Campos inválidos'; END IF;
 FOR k IN SELECT jsonb_object_keys(p_fields) LOOP
  IF k NOT IN ('supplier_name','supplier_nif','invoice_number','invoice_date','currency','original_amount','fx_rate','fx_rate_source','total_amount','iva_amount','paid_by_partner_id','customer_nif','notes') THEN RAISE EXCEPTION 'Campo não permitido'; END IF;
 END LOOP;
 IF nullif(btrim(p_fields->>'supplier_name'),'') IS NULL OR nullif(btrim(p_fields->>'supplier_nif'),'') IS NULL OR nullif(btrim(p_fields->>'invoice_number'),'') IS NULL THEN RAISE EXCEPTION 'Confirma fornecedor, NIF e número da fatura'; END IF;
 day:=(p_fields->>'invoice_date')::date;
 IF day IS NULL OR to_char(day,'YYYY-MM-DD') IS DISTINCT FROM p_fields->>'invoice_date' THEN RAISE EXCEPTION 'Data civil inválida'; END IF;
 payer:=(p_fields->>'paid_by_partner_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=payer AND company_id=s.company_id) THEN RAISE EXCEPTION 'Confirma um pagador da empresa'; END IF;
 SELECT tax_id INTO company_tax FROM public.companies WHERE id=s.company_id FOR SHARE;
 IF nullif(regexp_replace(company_tax,'[^a-zA-Z0-9]','','g'),'') IS NULL OR lower(regexp_replace(company_tax,'[^a-zA-Z0-9]','','g')) IS DISTINCT FROM lower(regexp_replace(p_fields->>'customer_nif','[^a-zA-Z0-9]','','g')) THEN RAISE EXCEPTION 'NIF do destinatário não corresponde à empresa'; END IF;
 ccy:=p_fields->>'currency'; total:=(p_fields->>'total_amount')::numeric; vat:=(p_fields->>'iva_amount')::numeric;
 IF ccy IS NULL OR ccy NOT IN ('EUR','USD','BRL','GBP') OR total IS NULL OR total<0 OR vat IS NULL OR vat<0 OR vat>total OR round(total,2)<>total OR round(vat,2)<>vat THEN RAISE EXCEPTION 'Valores inválidos'; END IF;
 rate:=CASE WHEN ccy='EUR' THEN 1 ELSE (p_fields->>'fx_rate')::numeric END;
 original:=CASE WHEN ccy='EUR' THEN total ELSE (p_fields->>'original_amount')::numeric END;
 IF rate IS NULL OR rate<=0 OR original IS NULL OR original<0 OR round(original*rate,2)<>total OR (ccy<>'EUR' AND nullif(p_fields->>'fx_rate_source','') IS NULL) THEN RAISE EXCEPTION 'Câmbio não validado'; END IF;
 IF EXISTS(SELECT 1 FROM public.standalone_invoices WHERE company_id=s.company_id AND lower(regexp_replace(supplier_nif,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(p_fields->>'supplier_nif','[^a-zA-Z0-9]','','g')) AND upper(btrim(invoice_number))=upper(btrim(p_fields->>'invoice_number'))) THEN RAISE EXCEPTION 'Fatura existente; nenhuma nova ação. Conferir no ERP.' USING ERRCODE='23505'; END IF;
 SELECT coalesce(max(version),0)+1 INTO n FROM public.data_entry_previews WHERE session_id=s.id;
 snap:=jsonb_build_object('schema_version',1,'operation','standalone_invoice_v1','company_id',s.company_id,'company_tax',company_tax,'event_id',s.event_id,
 'document',to_jsonb(d),'fields',p_fields||jsonb_build_object('fx_rate',rate,'original_amount',original,'total_amount',total,'iva_amount',vat),
 'payer_name',(SELECT full_name FROM public.profiles WHERE id=payer),'provenance','confirmed_by_user','effects',jsonb_build_array('Criar uma Fatura Avulsa e guardar o documento; sem transação, BP, conta, lista ou reembolso'));
 INSERT INTO public.data_entry_previews(session_id,company_id,document_id,version,operation,snapshot,snapshot_hash)
 VALUES(s.id,s.company_id,d.id,n,'standalone_invoice_v1',snap,encode(extensions.digest(snap::text,'sha256'),'hex')) RETURNING * INTO v;
 RETURN to_jsonb(v);
END $$;
REVOKE ALL ON FUNCTION public.data_entry_prepare(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.data_entry_prepare(uuid,uuid,uuid,jsonb) TO service_role;

CREATE FUNCTION public.data_entry_commit(p_user uuid,p_preview uuid,p_verified_sha text,p_final_path text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.data_entry_previews; s public.data_entry_sessions; d public.data_entry_documents; r public.data_entry_results;
 f jsonb; author_name text; mark text; tax text; payer uuid; output jsonb;
BEGIN
 SELECT * INTO v FROM public.data_entry_previews WHERE id=p_preview;
 SELECT * INTO s FROM public.data_entry_sessions WHERE id=v.session_id AND owner_id=p_user FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Lote inválido' USING ERRCODE='42501'; END IF;
 author_name:=public.data_entry_assert(p_user,s.company_id);
 SELECT * INTO r FROM public.data_entry_results WHERE preview_id=v.id;
 IF r.preview_id IS NOT NULL THEN RETURN r.result; END IF;
 IF NOT coalesce((SELECT execute_validated FROM public.data_entry_settings WHERE singleton),false) THEN RAISE EXCEPTION 'Execução não validada; indisponível' USING ERRCODE='42501'; END IF;
 IF v.version<>(SELECT max(version) FROM public.data_entry_previews WHERE session_id=s.id) THEN RAISE EXCEPTION 'Prévia alterada; autoriza a versão atual' USING ERRCODE='40001'; END IF;
 SELECT * INTO d FROM public.data_entry_documents WHERE id=v.document_id FOR SHARE;
 IF v.snapshot->'document' IS DISTINCT FROM to_jsonb(d) OR p_verified_sha IS DISTINCT FROM d.sha256 OR p_final_path IS DISTINCT FROM (s.company_id::text||'/assistant333/'||d.id::text||'/'||d.sha256||(CASE d.mime WHEN 'application/pdf' THEN '.pdf' WHEN 'image/jpeg' THEN '.jpg' ELSE '.png' END)) THEN RAISE EXCEPTION 'Documento alterado'; END IF;
 f:=v.snapshot->'fields'; payer:=(f->>'paid_by_partner_id')::uuid;
 SELECT tax_id INTO tax FROM public.companies WHERE id=s.company_id FOR SHARE;
 IF tax IS DISTINCT FROM v.snapshot->>'company_tax' OR (SELECT full_name FROM public.profiles WHERE id=payer) IS DISTINCT FROM v.snapshot->>'payer_name' OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=payer AND company_id=s.company_id) THEN RAISE EXCEPTION 'Dados ERP alterados; preparar nova prévia' USING ERRCODE='40001'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(s.company_id::text||lower(regexp_replace(f->>'supplier_nif','[^a-zA-Z0-9]','','g'))||upper(btrim(f->>'invoice_number')),333));
 IF EXISTS(SELECT 1 FROM public.standalone_invoices WHERE company_id=s.company_id AND lower(regexp_replace(supplier_nif,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(f->>'supplier_nif','[^a-zA-Z0-9]','','g')) AND upper(btrim(invoice_number))=upper(btrim(f->>'invoice_number'))) THEN RAISE EXCEPTION 'Fatura já existente; revalidar prévia' USING ERRCODE='23505'; END IF;
 mark:='Feito por LLM com autorização de '||author_name||' em '||to_char(now() AT TIME ZONE 'Europe/Lisbon','DD/MM/YYYY')||'.';
 INSERT INTO public.standalone_invoices(id,company_id,storage_path,file_name,supplier_name,supplier_nif,invoice_number,invoice_date,currency,original_amount,fx_rate,fx_rate_source,total_amount,iva_amount,paid_by_partner_id,notes,status,created_by)
 VALUES(v.destination_id,s.company_id,p_final_path,d.name,btrim(f->>'supplier_name'),btrim(f->>'supplier_nif'),btrim(f->>'invoice_number'),(f->>'invoice_date')::date,f->>'currency',(f->>'original_amount')::numeric,(f->>'fx_rate')::numeric,f->>'fx_rate_source',(f->>'total_amount')::numeric,(f->>'iva_amount')::numeric,payer,concat_ws(E'\n',nullif(btrim(f->>'notes'),''),mark),'new',p_user);
 output:=jsonb_build_object('invoice_id',v.destination_id,'preview_id',v.id,'document_id',d.id,'path',p_final_path,'sha256',d.sha256,'status','new','total_amount',(f->>'total_amount')::numeric,'invoice_date',f->>'invoice_date','approved_by',p_user,'approved_name',author_name,'approved_at',now(),'observation',mark);
 INSERT INTO public.data_entry_results(preview_id,company_id,document_id,invoice_id,approved_by,approved_name,snapshot_hash,result) VALUES(v.id,s.company_id,d.id,v.destination_id,p_user,author_name,v.snapshot_hash,output);
 RETURN output;
END $$;
REVOKE ALL ON FUNCTION public.data_entry_commit(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.data_entry_commit(uuid,uuid,text,text) TO service_role;

CREATE FUNCTION public.data_entry_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Registo técnico imutável'; END $$;
REVOKE ALL ON FUNCTION public.data_entry_immutable() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.data_entry_immutable() TO service_role;
CREATE TRIGGER data_entry_documents_immutable BEFORE UPDATE OR DELETE ON public.data_entry_documents FOR EACH ROW EXECUTE FUNCTION public.data_entry_immutable();
CREATE TRIGGER data_entry_previews_immutable BEFORE UPDATE OR DELETE ON public.data_entry_previews FOR EACH ROW EXECUTE FUNCTION public.data_entry_immutable();
CREATE TRIGGER data_entry_results_immutable BEFORE UPDATE OR DELETE ON public.data_entry_results FOR EACH ROW EXECUTE FUNCTION public.data_entry_immutable();