-- PREPARADA, NÃO APLICADA — #303 E2b/R3; autorização 6666841381; reserva 6673808601.
-- Base: main 18fc0f7 + 0345. Q1–Q6 6669982231; SaaS 6670199047; D-ERP247.
-- Não executar nem activar contas. Apenas DDL e corpos de comandos; sem seed/backfill.
-- R4 substitui exclusivamente o ponto privado r4_validate após revisão autorizada.
-- Não há corte/cadeia/posição implementados aqui nem fallback para a soma documental.
BEGIN;

CREATE SCHEMA issue303_private;
REVOKE ALL ON SCHEMA issue303_private FROM PUBLIC, anon, authenticated, service_role;

-- Só os comandos DEFINER escrevem este contexto, ligado ao backend e à transacção.
-- Não é uma GUC, um papel de cliente ou um segredo transportado no pedido.
CREATE TABLE issue303_private.command_context (
  backend integer NOT NULL, transaction_id bigint NOT NULL,
  statement_id uuid NOT NULL, operation text NOT NULL CHECK (operation IN ('draft','confirm','supplement')),
  PRIMARY KEY (backend, transaction_id)
);

-- Contrato do verificador de anexos futuro: sob lock do objecto o backend lê os
-- bytes reais e insere aqui; não existe RPC de cliente para atestar uploads/hashes.
-- A cópia imutável conserva os bytes mesmo perante uma falha externa do storage.
-- Nesta preparação a tabela nasce vazia; os testes carregam SOMENTE bytes sintéticos.
CREATE TABLE issue303_private.verified_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  bucket_id text NOT NULL,
  file_path text NOT NULL,
  storage_object_id uuid NOT NULL,
  bytes bytea NOT NULL CHECK (octet_length(bytes) > 0),
  sha256 text GENERATED ALWAYS AS (encode(sha256(bytes), 'hex')) STORED,
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, file_path)
);
CREATE TABLE issue303_private.source_claims (
  transaction_id uuid PRIMARY KEY REFERENCES public.transactions(id),
  statement_id uuid NOT NULL REFERENCES public.ticket_office_statements(id),
  line_id uuid NOT NULL REFERENCES public.ticket_office_statement_lines(id)
);
REVOKE ALL ON ALL TABLES IN SCHEMA issue303_private FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.ticket_office_statement_documents
  ADD COLUMN verified_file_id uuid REFERENCES issue303_private.verified_files(id),
  ADD COLUMN verified_sha256 text CHECK (verified_sha256 IS NULL OR verified_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN supplement_reason text,
  ADD CONSTRAINT issue303_supplement_reason CHECK
    (supplement_reason IS NULL OR length(btrim(supplement_reason)) > 0);

CREATE FUNCTION issue303_private.r4_validate(p_statement uuid, p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'capacidade_r4_em_falta' USING ERRCODE = '55000';
END $$;
REVOKE ALL ON FUNCTION issue303_private.r4_validate(uuid,bigint) FROM PUBLIC, anon, authenticated, service_role;
-- Contrato reservado: R4 revalida corte/fuso/cadeia e posição independente sob os
-- locks já adquiridos. Devolve {contract_version:2, statement_id, revision,
-- independent_position, position_cutoff_at, position_timezone,
-- position_cutoff_source, sources:[...]}. Nunca aceita esses valores do cliente.

CREATE FUNCTION issue303_private.assert_actor(p_company uuid, p_account uuid, p_confirm boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR p_company IS DISTINCT FROM public.current_company_id()
     OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
       AND company_id = p_company AND (role = 'admin'::public.app_role
         OR (NOT p_confirm AND role = 'manager'::public.app_role))) THEN
    RAISE EXCEPTION 'issue303_company_role_required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_accounts
      WHERE id = p_account AND company_id = p_company AND type = 'ticket_office')
     OR NOT public._issue303_account_enabled(p_company,p_account) THEN
    RAISE EXCEPTION 'issue303_account_not_enabled' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE FUNCTION issue303_private.money(p_value jsonb)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE n numeric;
BEGIN
  IF p_value IS NULL OR p_value = 'null'::jsonb THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_value) <> 'number' THEN RAISE EXCEPTION 'issue303_invalid_cents' USING ERRCODE = '22023'; END IF;
  n := p_value::text::numeric;
  IF n <> trunc(n) OR abs(n) > 99999999999999 THEN
    RAISE EXCEPTION 'issue303_invalid_cents' USING ERRCODE = '22023';
  END IF;
  RETURN n / 100;
END $$;

-- Account -> parents (UUID) -> events (UUID), antes de qualquer validação de estado.
-- A conta é imutável durante a vida v2. R4 poderá acrescentar pais à mesma ordem.
CREATE FUNCTION issue303_private.lock_document(p_statement uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM public.ticket_office_statements WHERE id = p_statement;
  IF NOT FOUND THEN RAISE EXCEPTION 'issue303_statement_not_found' USING ERRCODE = '42501'; END IF;
  PERFORM issue303_private.assert_actor(s.company_id,s.financial_account_id,false);
  PERFORM 1 FROM public.financial_accounts WHERE id = s.financial_account_id FOR UPDATE;
  -- Serializa alterações da configuração com o comando inteiro.
  PERFORM 1 FROM public.company_features WHERE company_id = s.company_id
    AND feature_key = 'ticket-office-statements-v2' FOR SHARE;
  PERFORM 1 FROM public.ticket_office_statements
    WHERE company_id = s.company_id AND financial_account_id = s.financial_account_id AND (id = p_statement OR id = s.predecessor_statement_id
      OR id IN (SELECT previous_statement_id FROM public.ticket_office_statement_lines WHERE statement_id = p_statement)
      OR id IN (SELECT adjusts_statement_id FROM public.ticket_office_statement_lines WHERE statement_id = p_statement))
    ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.events WHERE id IN
    (SELECT event_id FROM public.ticket_office_statement_lines WHERE statement_id = p_statement)
    ORDER BY id FOR UPDATE;
  PERFORM issue303_private.assert_actor(s.company_id,s.financial_account_id,false);
END $$;

-- Mesma ordem de chaves em comandos e escritores, sem serializar a plataforma.
CREATE FUNCTION issue303_private.lock_source_keys(p_transactions uuid[], p_groups uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE k bigint;
BEGIN
  FOR k IN SELECT DISTINCT hashtextextended(key,0) FROM (
    SELECT 'issue303-tx:'||x::text AS key FROM unnest(p_transactions) x WHERE x IS NOT NULL
    UNION SELECT 'issue303-group:'||x::text FROM unnest(p_groups) x WHERE x IS NOT NULL
    UNION SELECT 'issue303-group:'||invoice_group_id::text FROM public.transactions
      WHERE id = ANY(p_transactions) AND invoice_group_id IS NOT NULL
  ) keys ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(k);
  END LOOP;
END $$;

-- Expande grupos em transacções concretas: grupo não contorna a unicidade por ID.
CREATE FUNCTION issue303_private.line_sources(p_statement uuid)
RETURNS TABLE(line_id uuid, transaction_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT l.id,t.id FROM public.ticket_office_statement_lines l JOIN public.transactions t
    ON t.id = l.transaction_id OR (l.invoice_group_id IS NOT NULL AND t.invoice_group_id = l.invoice_group_id)
    WHERE l.statement_id = p_statement
$$;

CREATE FUNCTION issue303_private.validate_references(p_statement uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.ticket_office_statements; l public.ticket_office_statement_lines; n integer; total numeric;
BEGIN
  SELECT * INTO STRICT s FROM public.ticket_office_statements WHERE id = p_statement;
  IF s.predecessor_statement_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ticket_office_statements p
      WHERE p.id = s.predecessor_statement_id AND p.id <> s.id AND p.company_id = s.company_id
        AND p.financial_account_id = s.financial_account_id AND p.status = 'confirmed') THEN
    RAISE EXCEPTION 'issue303_invalid_predecessor_reference' USING ERRCODE = '42501';
  END IF;
  FOR l IN SELECT * FROM public.ticket_office_statement_lines WHERE statement_id = s.id ORDER BY position LOOP
    IF l.company_id <> s.company_id OR l.document_line_type IS NULL THEN
      RAISE EXCEPTION 'issue303_invalid_line_parent' USING ERRCODE = '42501';
    END IF;
    IF l.event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.events e
        JOIN public.event_ticket_office_assignments a ON a.event_id = e.id
        WHERE e.id = l.event_id AND e.company_id = s.company_id AND a.financial_account_id = s.financial_account_id) THEN
      RAISE EXCEPTION 'issue303_invalid_event' USING ERRCODE = '42501';
    END IF;
    IF l.ticket_office_settlement_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ticket_office_settlements
        WHERE id = l.ticket_office_settlement_id AND company_id = s.company_id
          AND financial_account_id = s.financial_account_id AND event_id = l.event_id AND status <> 'reversed') THEN
      RAISE EXCEPTION 'issue303_invalid_settlement' USING ERRCODE = '42501';
    END IF;
    IF l.quota_line_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ticket_office_statement_lines q
        WHERE q.id = l.quota_line_id AND q.statement_id = s.id AND q.event_id = l.event_id
          AND q.document_line_type = 'event_sales') THEN
      RAISE EXCEPTION 'issue303_invalid_quota_reference' USING ERRCODE = '23514';
    END IF;
    IF l.previous_statement_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ticket_office_statements p
        WHERE p.id = l.previous_statement_id AND p.company_id = s.company_id
          AND p.financial_account_id = s.financial_account_id AND p.status = 'confirmed' AND p.id <> s.id) THEN
      RAISE EXCEPTION 'issue303_invalid_predecessor_reference' USING ERRCODE = '42501';
    END IF;
    IF l.adjusts_line_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ticket_office_statement_lines old
        JOIN public.ticket_office_statements p ON p.id = old.statement_id
        WHERE old.id = l.adjusts_line_id AND p.id = l.adjusts_statement_id AND p.id <> s.id
          AND p.status = 'confirmed' AND p.company_id = s.company_id AND p.financial_account_id = s.financial_account_id
          AND old.event_id IS NOT DISTINCT FROM l.event_id) THEN
      RAISE EXCEPTION 'issue303_invalid_adjustment_reference' USING ERRCODE = '42501';
    END IF;
    IF l.event_id IS NOT NULL AND l.document_line_type <> 'event_sales' AND l.quota_line_id IS NULL
       AND EXISTS (SELECT 1 FROM public.ticket_office_statement_events WHERE event_id = l.event_id)
       AND l.adjusts_line_id IS NULL THEN
      RAISE EXCEPTION 'issue303_adjustment_reference_required' USING ERRCODE = '23514';
    END IF;
    IF l.transaction_id IS NOT NULL OR l.invoice_group_id IS NOT NULL THEN
      SELECT count(*),sum(CASE WHEN t.type = 'expense' THEN -t.amount WHEN t.type = 'income' THEN t.amount END)
        INTO n,total FROM public.transactions t
        WHERE t.id = l.transaction_id OR (l.invoice_group_id IS NOT NULL AND t.invoice_group_id = l.invoice_group_id);
      IF n = 0 OR EXISTS (SELECT 1 FROM public.transactions t WHERE
          (t.id = l.transaction_id OR (l.invoice_group_id IS NOT NULL AND t.invoice_group_id = l.invoice_group_id))
          AND (t.company_id <> s.company_id OR t.account_id IS DISTINCT FROM s.financial_account_id
            OR t.currency IS DISTINCT FROM 'EUR' OR t.reversed_at IS NOT NULL OR t.type NOT IN ('expense','income')
            OR (l.event_id IS NOT NULL AND t.event_id IS DISTINCT FROM l.event_id)
            OR (l.document_line_type = 'advance' AND (t.type <> 'expense' OR t.status <> 'paid'
              OR t.paid_amount <> t.amount OR NOT EXISTS (SELECT 1 FROM public.account_categories c
                WHERE c.id = t.category_id AND c.company_id = s.company_id AND c.code = '10.3'))))) THEN
        RAISE EXCEPTION 'issue303_invalid_transaction_source' USING ERRCODE = '42501';
      END IF;
      IF NOT l.pending_document AND total IS DISTINCT FROM l.amount THEN
        RAISE EXCEPTION 'issue303_source_amount_mismatch' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF l.source_sha256 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ticket_office_statement_documents d
        JOIN issue303_private.verified_files v ON v.id = d.verified_file_id
        WHERE d.statement_id = s.id AND v.sha256 = l.source_sha256) THEN
      RAISE EXCEPTION 'issue303_unverified_line_proof' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF EXISTS (SELECT transaction_id FROM issue303_private.line_sources(s.id) GROUP BY transaction_id HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM issue303_private.line_sources(s.id) x JOIN issue303_private.source_claims c USING(transaction_id)
       WHERE c.statement_id <> s.id)
     OR EXISTS (SELECT 1 FROM issue303_private.line_sources(s.id) x JOIN public.transactions t ON t.id = x.transaction_id
       JOIN public.ticket_office_statement_lines other ON other.statement_id <> s.id
         AND (other.transaction_id = t.id OR (other.invoice_group_id IS NOT NULL AND other.invoice_group_id = t.invoice_group_id))) THEN
    RAISE EXCEPTION 'issue303_source_already_used' USING ERRCODE = '23505';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._issue303_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE p record; ctx record; ids uuid[] := '{}'; protected boolean := false;
BEGIN
  SELECT * INTO ctx FROM issue303_private.command_context
    WHERE backend = pg_backend_pid() AND transaction_id = txid_current();
  IF TG_TABLE_NAME = 'ticket_office_statement_config_log' THEN
    RAISE EXCEPTION 'issue303_audit_immutable' USING ERRCODE = '42501';
  ELSIF TG_TABLE_NAME = 'ticket_office_statements' THEN
    IF TG_OP <> 'INSERT' THEN
      protected := OLD.contract_version = 2 OR public._issue303_account_enabled(OLD.company_id,OLD.financial_account_id);
      IF OLD.contract_version = 2 AND (OLD.status = 'confirmed' OR TG_OP = 'DELETE') THEN
        RAISE EXCEPTION 'issue303_confirmed_or_retained_immutable' USING ERRCODE = '42501';
      END IF;
      IF OLD.contract_version = 2 AND (NEW.company_id IS DISTINCT FROM OLD.company_id
          OR NEW.financial_account_id IS DISTINCT FROM OLD.financial_account_id OR NEW.contract_version <> 2) THEN
        RAISE EXCEPTION 'issue303_identity_immutable' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      protected := protected OR NEW.contract_version = 2 OR public._issue303_account_enabled(NEW.company_id,NEW.financial_account_id);
      IF NOT EXISTS (SELECT 1 FROM public.financial_accounts WHERE id = NEW.financial_account_id AND company_id = NEW.company_id) THEN
        RAISE EXCEPTION 'issue303_account_company_mismatch' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF protected AND (ctx.statement_id IS DISTINCT FROM coalesce(NEW.id,OLD.id)
       OR ctx.operation NOT IN ('draft','confirm') OR NEW.contract_version <> 2) THEN
      RAISE EXCEPTION 'issue303_private_command_required' USING ERRCODE = '42501';
    END IF;
    IF NOT protected AND TG_OP <> 'DELETE' AND (NEW.predecessor_statement_id IS NOT NULL OR NEW.primary_document_id IS NOT NULL
       OR NEW.confirmation_receipt IS NOT NULL OR NEW.opening_balance_line_id IS NOT NULL
       OR NEW.position_cutoff_at IS NOT NULL OR NEW.revision <> 1) THEN
      RAISE EXCEPTION 'issue303_v2_requires_v2_parent_and_command' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME IN ('ticket_office_statement_lines','ticket_office_statement_documents','ticket_office_statement_events') THEN
    IF TG_OP <> 'INSERT' THEN ids := array_append(ids,OLD.statement_id); END IF;
    IF TG_OP <> 'DELETE' THEN ids := array_append(ids,NEW.statement_id); END IF;
    -- Sem contexto falha antes de adquirir locks: nenhum escritor antigo inverte
    -- a ordem conta/pais. Nos comandos, os locks já foram adquiridos nessa ordem.
    FOR p IN SELECT * FROM public.ticket_office_statements WHERE id = ANY(ids) ORDER BY id LOOP
      IF p.contract_version = 2 OR public._issue303_account_enabled(p.company_id,p.financial_account_id)
         OR TG_TABLE_NAME = 'ticket_office_statement_events' THEN
        IF ctx.statement_id IS DISTINCT FROM p.id THEN
          RAISE EXCEPTION 'issue303_private_command_required' USING ERRCODE = '42501';
        END IF;
        IF p.status = 'confirmed' AND NOT (TG_TABLE_NAME = 'ticket_office_statement_documents'
            AND TG_OP = 'INSERT' AND ctx.operation = 'supplement' AND to_jsonb(NEW)->>'supplement_reason' IS NOT NULL) THEN
          RAISE EXCEPTION 'issue303_confirmed_immutable' USING ERRCODE = '42501';
        END IF;
        IF TG_TABLE_NAME = 'ticket_office_statement_events' AND (ctx.operation <> 'confirm' OR TG_OP <> 'INSERT') THEN
          RAISE EXCEPTION 'issue303_membership_immutable' USING ERRCODE = '42501';
        END IF;
      END IF;
    END LOOP;
    PERFORM 1 FROM public.ticket_office_statements WHERE id = ANY(ids) ORDER BY id FOR UPDATE;
    IF TG_OP <> 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.ticket_office_statements
        WHERE id = NEW.statement_id AND company_id = NEW.company_id) THEN
      RAISE EXCEPTION 'issue303_invalid_child_company' USING ERRCODE = '42501';
    END IF;
    IF TG_TABLE_NAME = 'ticket_office_statement_lines' AND TG_OP <> 'DELETE' THEN
      PERFORM issue303_private.lock_source_keys(ARRAY[NEW.transaction_id],ARRAY[NEW.invoice_group_id]);
      IF NEW.document_line_type IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ticket_office_statements
          WHERE id = NEW.statement_id AND contract_version = 2) THEN
        RAISE EXCEPTION 'issue303_v2_requires_v2_parent_and_command' USING ERRCODE = '42501';
      END IF;
      IF EXISTS (SELECT 1 FROM issue303_private.source_claims c JOIN public.transactions t ON t.id = c.transaction_id
          WHERE c.statement_id <> NEW.statement_id AND (t.id = NEW.transaction_id
            OR (NEW.invoice_group_id IS NOT NULL AND t.invoice_group_id = NEW.invoice_group_id))) THEN
        RAISE EXCEPTION 'issue303_source_already_used' USING ERRCODE = '23505';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'issue303_private_command_required' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public._issue303_write_guard() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.save_ticket_office_statement_draft(p_statement_id uuid, p_expected_revision bigint, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.ticket_office_statements; sid uuid := coalesce(p_statement_id,gen_random_uuid());
  c uuid := public.current_company_id(); a uuid; item jsonb; lid uuid; did uuid; file_record record; num text; rev bigint;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'documents') IS DISTINCT FROM 'array'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k <> ALL(ARRAY[
       'financial_account_id','number','statement_date','document_total_cents','notes','lines','documents','primary_document_id','predecessor_statement_id'])) THEN
    RAISE EXCEPTION 'issue303_invalid_draft_payload' USING ERRCODE = '22023';
  END IF;
  a := (p_payload->>'financial_account_id')::uuid;
  PERFORM issue303_private.assert_actor(c,a,false);
  PERFORM 1 FROM public.financial_accounts WHERE id = a FOR UPDATE;
  PERFORM 1 FROM public.company_features WHERE company_id = c AND feature_key = 'ticket-office-statements-v2' FOR SHARE;
  IF p_statement_id IS NOT NULL THEN
    -- Pais novos e existentes bloqueados juntos, sem inverter a ordem UUID.
    PERFORM 1 FROM public.ticket_office_statements WHERE company_id = c AND financial_account_id = a AND (id = sid OR id IN
      (SELECT (x->>'previous_statement_id')::uuid FROM jsonb_array_elements(p_payload->'lines') x
       UNION SELECT (x->>'adjusts_statement_id')::uuid FROM jsonb_array_elements(p_payload->'lines') x
       UNION SELECT (p_payload->>'predecessor_statement_id')::uuid
       UNION SELECT predecessor_statement_id FROM public.ticket_office_statements WHERE id = sid
       UNION SELECT previous_statement_id FROM public.ticket_office_statement_lines WHERE statement_id = sid
       UNION SELECT adjusts_statement_id FROM public.ticket_office_statement_lines WHERE statement_id = sid))
      ORDER BY id FOR UPDATE;
    SELECT * INTO s FROM public.ticket_office_statements WHERE id = sid;
    IF s.id IS NULL OR s.company_id IS DISTINCT FROM c OR s.financial_account_id IS DISTINCT FROM a
       OR s.contract_version <> 2 OR s.status <> 'draft' THEN
      RAISE EXCEPTION 'issue303_invalid_draft' USING ERRCODE = '42501';
    END IF;
    IF p_expected_revision IS DISTINCT FROM s.revision THEN
      RAISE EXCEPTION 'issue303_revision_conflict' USING ERRCODE = '40001';
    END IF;
    rev := s.revision + 1;
  ELSE
    IF p_expected_revision IS DISTINCT FROM 0::bigint THEN RAISE EXCEPTION 'issue303_revision_conflict' USING ERRCODE = '40001'; END IF;
    PERFORM 1 FROM public.ticket_office_statements WHERE company_id = c AND financial_account_id = a AND id IN
      (SELECT (x->>'previous_statement_id')::uuid FROM jsonb_array_elements(p_payload->'lines') x
       UNION SELECT (x->>'adjusts_statement_id')::uuid FROM jsonb_array_elements(p_payload->'lines') x
       UNION SELECT (p_payload->>'predecessor_statement_id')::uuid) ORDER BY id FOR UPDATE;
    rev := 1;
  END IF;
  PERFORM 1 FROM public.events WHERE company_id = c AND id IN
    (SELECT (x->>'event_id')::uuid FROM jsonb_array_elements(p_payload->'lines') x
     UNION SELECT event_id FROM public.ticket_office_statement_lines WHERE statement_id = sid) ORDER BY id FOR UPDATE;
  PERFORM issue303_private.assert_actor(c,a,false);
  num := upper(regexp_replace(btrim(p_payload->>'number'),'\s+','','g'));
  IF num IS NULL OR num = '' OR nullif(p_payload->>'statement_date','') IS NULL THEN
    RAISE EXCEPTION 'issue303_number_date_required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ticket_office_statements WHERE financial_account_id = a AND id <> sid
      AND upper(regexp_replace(btrim(number),'\s+','','g')) = num) THEN
    RAISE EXCEPTION 'issue303_duplicate_number' USING ERRCODE = '23505';
  END IF;
  INSERT INTO issue303_private.command_context VALUES (pg_backend_pid(),txid_current(),sid,'draft');
  IF p_statement_id IS NULL THEN
    INSERT INTO public.ticket_office_statements(id,company_id,financial_account_id,number,statement_date,document_total,notes,created_by,contract_version,predecessor_statement_id)
      VALUES (sid,c,a,num,(p_payload->>'statement_date')::date,issue303_private.money(p_payload->'document_total_cents'),p_payload->>'notes',auth.uid(),2,(p_payload->>'predecessor_statement_id')::uuid);
  ELSE
    UPDATE public.ticket_office_statements SET primary_document_id = NULL,primary_document_sha256 = NULL,
      number = num,statement_date = (p_payload->>'statement_date')::date,
      document_total = issue303_private.money(p_payload->'document_total_cents'),notes = p_payload->>'notes',
      revision = rev,updated_at = now(),predecessor_statement_id = (p_payload->>'predecessor_statement_id')::uuid WHERE id = sid;
    DELETE FROM public.ticket_office_statement_lines WHERE statement_id = sid;
    DELETE FROM public.ticket_office_statement_documents WHERE statement_id = sid;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'documents') LOOP
    did := (item->>'id')::uuid;
    SELECT * INTO file_record FROM issue303_private.verified_files WHERE id = (item->>'verified_file_id')::uuid FOR SHARE;
    IF file_record.id IS NULL OR file_record.company_id <> c OR file_record.bucket_id <> 'ticket-office-settlements'
       OR file_record.file_path NOT LIKE c::text||'/statements/'||sid::text||'/%'
       OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE id = file_record.storage_object_id AND bucket_id = file_record.bucket_id AND name = file_record.file_path) THEN
      RAISE EXCEPTION 'issue303_verified_document_required' USING ERRCODE = '23514';
    END IF;
    PERFORM 1 FROM storage.objects WHERE id = file_record.storage_object_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'issue303_proof_object_missing' USING ERRCODE = '23514'; END IF;
    INSERT INTO public.ticket_office_statement_documents
      (id,statement_id,company_id,file_path,file_name,mime_type,file_size,document_source,created_by,verified_file_id,verified_sha256)
      VALUES (did,sid,c,file_record.file_path,item->>'file_name',item->>'mime_type',octet_length(file_record.bytes),item->>'document_source',auth.uid(),file_record.id,file_record.sha256);
  END LOOP;
  -- IDs de quotas são atribuídos pelo chamador; FKs só são verificadas depois
  -- de inserir todas as linhas, permitindo deduções antes da quota no PDF.
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
    lid := (item->>'id')::uuid;
    INSERT INTO public.ticket_office_statement_lines
      (id,statement_id,company_id,position,line_type,document_line_type,description,amount,pending_document,event_id,
       ticket_office_settlement_id,transaction_id,invoice_group_id,previous_statement_id,notes,document_page,document_line_ref,
       source_sha256,declared_event_net,event_gross_amount,event_retained_amount,opening_note,opening_created_by,opening_created_at,
       adjusts_statement_id,adjusts_line_id,adjustment_reason,positive_sign_evidence)
    VALUES (lid,sid,c,(item->>'position')::integer,
      CASE item->>'document_line_type' WHEN 'event_sales' THEN 'event_right' WHEN 'opening_balance' THEN 'carry_over' ELSE item->>'document_line_type' END,
      item->>'document_line_type',item->>'description',issue303_private.money(item->'amount_cents'),
      coalesce((item->>'pending_document')::boolean,false),(item->>'event_id')::uuid,(item->>'ticket_office_settlement_id')::uuid,
      (item->>'transaction_id')::uuid,(item->>'invoice_group_id')::uuid,(item->>'previous_statement_id')::uuid,item->>'notes',
      (item->>'document_page')::integer,item->>'document_line_ref',item->>'source_sha256',
      issue303_private.money(item->'declared_event_net_cents'),issue303_private.money(item->'event_gross_cents'),
      issue303_private.money(item->'event_retained_cents'),item->>'opening_note',
      CASE WHEN item->>'document_line_type' = 'opening_balance' THEN auth.uid() END,
      CASE WHEN item->>'document_line_type' = 'opening_balance' THEN now() END,
      (item->>'adjusts_statement_id')::uuid,(item->>'adjusts_line_id')::uuid,item->>'adjustment_reason',item->>'positive_sign_evidence');
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'lines') WHERE value->>'quota_line_id' IS NOT NULL LOOP
    UPDATE public.ticket_office_statement_lines SET quota_line_id = (item->>'quota_line_id')::uuid WHERE id = (item->>'id')::uuid AND statement_id = sid;
  END LOOP;
  IF p_payload->>'primary_document_id' IS NOT NULL THEN
    SELECT d.id,v.sha256 INTO file_record FROM public.ticket_office_statement_documents d
      JOIN issue303_private.verified_files v ON v.id = d.verified_file_id
      WHERE d.id = (p_payload->>'primary_document_id')::uuid AND d.statement_id = sid
        AND d.document_source = 'apuramento' AND d.mime_type = 'application/pdf'
        AND substring(v.bytes FROM 1 FOR 5) = convert_to('%PDF-','UTF8');
    IF NOT FOUND THEN RAISE EXCEPTION 'issue303_primary_pdf_required' USING ERRCODE = '23514'; END IF;
    UPDATE public.ticket_office_statements SET primary_document_id = file_record.id,primary_document_sha256 = file_record.sha256 WHERE id = sid;
  END IF;
  PERFORM issue303_private.validate_references(sid);
  DELETE FROM issue303_private.command_context WHERE backend = pg_backend_pid() AND transaction_id = txid_current();
  RETURN jsonb_build_object('contract_version',2,'statement_id',sid,'revision',rev,'status','draft');
END $$;
REVOKE ALL ON FUNCTION public.save_ticket_office_statement_draft(uuid,bigint,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_ticket_office_statement_draft(uuid,bigint,jsonb) TO authenticated;

CREATE FUNCTION public.confirm_ticket_office_statement(p_statement_id uuid, p_expected_revision bigint, p_approve_opening boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.ticket_office_statements; total numeric; opening uuid; r4 jsonb; receipt jsonb; at_time timestamptz;
BEGIN
  PERFORM issue303_private.lock_document(p_statement_id);
  SELECT * INTO STRICT s FROM public.ticket_office_statements WHERE id = p_statement_id;
  PERFORM issue303_private.assert_actor(s.company_id,s.financial_account_id,true);
  IF s.contract_version <> 2 THEN RAISE EXCEPTION 'issue303_v2_required' USING ERRCODE = '42501'; END IF;
  IF s.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'issue303_revision_conflict' USING ERRCODE = '40001'; END IF;
  IF s.status = 'confirmed' THEN
    IF coalesce((s.confirmation_receipt->>'opening_approved')::boolean,false) IS DISTINCT FROM coalesce(p_approve_opening,false) THEN
      RAISE EXCEPTION 'issue303_incompatible_retry' USING ERRCODE = '22023';
    END IF;
    RETURN s.confirmation_receipt;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ticket_office_statement_lines WHERE statement_id = s.id)
     OR EXISTS (SELECT 1 FROM public.ticket_office_statement_lines WHERE statement_id = s.id AND (pending_document OR amount IS NULL)) THEN
    RAISE EXCEPTION 'issue303_pending_document' USING ERRCODE = '23514';
  END IF;
  SELECT sum(amount) INTO total FROM public.ticket_office_statement_lines WHERE statement_id = s.id;
  IF total IS DISTINCT FROM s.document_total THEN RAISE EXCEPTION 'issue303_total_mismatch' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM public.ticket_office_statement_lines q WHERE q.statement_id = s.id AND q.document_line_type = 'event_sales'
      AND q.declared_event_net IS DISTINCT FROM q.amount + coalesce((SELECT sum(amount) FROM public.ticket_office_statement_lines d WHERE d.quota_line_id = q.id),0)) THEN
    RAISE EXCEPTION 'issue303_quota_mismatch' USING ERRCODE = '23514';
  END IF;
  PERFORM issue303_private.validate_references(s.id);
  IF EXISTS (SELECT 1 FROM public.ticket_office_statement_lines l JOIN public.ticket_office_statement_events e USING(event_id)
      WHERE l.statement_id = s.id AND l.document_line_type = 'event_sales') THEN
    RAISE EXCEPTION 'issue303_event_already_confirmed' USING ERRCODE = '23505';
  END IF;
  SELECT id INTO opening FROM public.ticket_office_statement_lines WHERE statement_id = s.id AND document_line_type = 'opening_balance';
  IF opening IS NOT NULL AND (NOT coalesce(p_approve_opening,false) OR s.predecessor_statement_id IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.ticket_office_statements WHERE financial_account_id = s.financial_account_id AND status = 'confirmed' AND id <> s.id)) THEN
    RAISE EXCEPTION 'issue303_opening_first_admin_approval_required' USING ERRCODE = '23514';
  END IF;
  IF opening IS NULL AND coalesce(p_approve_opening,false) THEN RAISE EXCEPTION 'issue303_no_opening_to_approve' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ticket_office_statement_documents d JOIN issue303_private.verified_files v ON v.id = d.verified_file_id
      WHERE d.id = s.primary_document_id AND d.statement_id = s.id AND d.company_id = s.company_id
        AND d.document_source = 'apuramento' AND d.mime_type = 'application/pdf' AND v.sha256 = s.primary_document_sha256)
     OR EXISTS (SELECT 1 FROM public.ticket_office_statement_lines WHERE statement_id = s.id
       AND (source_sha256 IS NULL OR document_page IS NULL OR document_line_ref IS NULL)) THEN
    RAISE EXCEPTION 'issue303_documentary_proof_required' USING ERRCODE = '23514';
  END IF;
  -- Bloqueia os bytes e os objectos antes da prova, impedindo substituição concorrente.
  PERFORM 1 FROM issue303_private.verified_files v JOIN public.ticket_office_statement_documents d ON d.verified_file_id = v.id
    WHERE d.statement_id = s.id ORDER BY v.id FOR SHARE OF v;
  PERFORM 1 FROM storage.objects o JOIN issue303_private.verified_files v ON v.storage_object_id = o.id
    JOIN public.ticket_office_statement_documents d ON d.verified_file_id = v.id
    WHERE d.statement_id = s.id ORDER BY o.id FOR SHARE OF o;
  IF EXISTS (SELECT 1 FROM public.ticket_office_statement_documents d JOIN issue303_private.verified_files v ON v.id = d.verified_file_id
      WHERE d.statement_id = s.id AND NOT EXISTS (SELECT 1 FROM storage.objects o
        WHERE o.id = v.storage_object_id AND o.bucket_id = v.bucket_id AND o.name = v.file_path)) THEN
    RAISE EXCEPTION 'issue303_proof_object_missing' USING ERRCODE = '23514';
  END IF;
  -- Estabiliza cada fonte/grupo antes de reclamar; INSERT de um novo membro
  -- usa a mesma chave de grupo e não pode surgir entre a soma e o recibo.
  PERFORM issue303_private.lock_source_keys(
    ARRAY(SELECT transaction_id FROM issue303_private.line_sources(s.id)),
    ARRAY(SELECT invoice_group_id FROM public.ticket_office_statement_lines WHERE statement_id = s.id));
  PERFORM 1 FROM public.transactions WHERE id IN
    (SELECT transaction_id FROM issue303_private.line_sources(s.id)) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.transaction_documents WHERE transaction_id IN
    (SELECT transaction_id FROM issue303_private.line_sources(s.id)) ORDER BY id FOR SHARE;
  PERFORM 1 FROM storage.objects WHERE bucket_id = 'transaction-documents' AND name IN
    (SELECT file_url FROM public.transaction_documents WHERE transaction_id IN
      (SELECT transaction_id FROM issue303_private.line_sources(s.id))) ORDER BY id FOR SHARE;
  PERFORM issue303_private.validate_references(s.id);
  r4 := issue303_private.r4_validate(s.id,s.revision); -- Recusa explícita até R4.
  IF r4 IS NULL OR jsonb_typeof(r4) <> 'object' OR r4->'contract_version' IS DISTINCT FROM '2'::jsonb
     OR r4->>'statement_id' IS DISTINCT FROM s.id::text OR r4->'revision' IS DISTINCT FROM to_jsonb(s.revision)
     OR jsonb_typeof(r4->'independent_position') IS DISTINCT FROM 'number'
     OR (r4->>'independent_position')::numeric IS DISTINCT FROM total
     OR jsonb_typeof(r4->'sources') IS DISTINCT FROM 'array' OR jsonb_array_length(r4->'sources') = 0
     OR nullif(r4->>'position_cutoff_at','') IS NULL OR nullif(r4->>'position_timezone','') IS NULL
     OR coalesce(r4->>'position_cutoff_source','') NOT IN ('company_day_end','pdf_explicit') THEN
    RAISE EXCEPTION 'issue303_invalid_r4_proof' USING ERRCODE = '23514';
  END IF;
  INSERT INTO issue303_private.command_context VALUES (pg_backend_pid(),txid_current(),s.id,'confirm');
  INSERT INTO issue303_private.source_claims SELECT transaction_id,s.id,line_id FROM issue303_private.line_sources(s.id);
  INSERT INTO public.ticket_office_statement_events(event_id,statement_id,company_id,financial_account_id,quota_line_id,created_by)
    SELECT event_id,s.id,s.company_id,s.financial_account_id,id,auth.uid() FROM public.ticket_office_statement_lines
    WHERE statement_id = s.id AND document_line_type = 'event_sales' ORDER BY event_id;
  at_time := clock_timestamp();
  receipt := jsonb_build_object('contract_version',2,'statement_id',s.id,'revision',s.revision,
    'calculated_total',total,'independent_position',r4->'independent_position','sources',r4->'sources',
    'confirmed_by',auth.uid(),'confirmed_at',at_time,'opening_approved',opening IS NOT NULL,
    'opening',CASE WHEN opening IS NOT NULL THEN (SELECT jsonb_build_object('line_id',id,'amount',amount,'note',opening_note,
      'prepared_by',opening_created_by,'prepared_at',opening_created_at,'approved_by',auth.uid(),'approved_at',at_time)
      FROM public.ticket_office_statement_lines WHERE id = opening) END,
    'position_proof',r4,'lines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY position) FROM public.ticket_office_statement_lines l WHERE statement_id = s.id),
    'transaction_documents',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY id),'[]'::jsonb) FROM public.transaction_documents d
      WHERE transaction_id IN (SELECT transaction_id FROM issue303_private.line_sources(s.id))),
    'documents',(SELECT jsonb_agg(jsonb_build_object('document_id',d.id,'verified_file_id',v.id,'bucket_id',v.bucket_id,
      'file_path',v.file_path,'sha256',v.sha256,'bytes',octet_length(v.bytes)) ORDER BY d.id)
      FROM public.ticket_office_statement_documents d JOIN issue303_private.verified_files v ON v.id = d.verified_file_id WHERE d.statement_id = s.id));
  UPDATE public.ticket_office_statements SET status = 'confirmed',confirmed_by = auth.uid(),confirmed_at = at_time,
    confirmation_receipt = receipt,opening_balance_line_id = opening,updated_at = at_time,
    position_cutoff_at = (r4->>'position_cutoff_at')::timestamptz,position_timezone = r4->>'position_timezone',
    position_cutoff_source = r4->>'position_cutoff_source' WHERE id = s.id;
  DELETE FROM issue303_private.command_context WHERE backend = pg_backend_pid() AND transaction_id = txid_current();
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.confirm_ticket_office_statement(uuid,bigint,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_ticket_office_statement(uuid,bigint,boolean) TO authenticated;

-- A assinatura legada conserva corpo/ACL. As guardas de tabela recusam-na em
-- contas activadas/v2, incluindo a chamada da 0212; não existe fallback silencioso.

CREATE FUNCTION public.add_ticket_office_statement_supplement(p_statement_id uuid, p_expected_revision bigint, p_document jsonb, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.ticket_office_statements; v issue303_private.verified_files; did uuid := gen_random_uuid();
BEGIN
  PERFORM issue303_private.lock_document(p_statement_id);
  SELECT * INTO STRICT s FROM public.ticket_office_statements WHERE id = p_statement_id;
  PERFORM issue303_private.assert_actor(s.company_id,s.financial_account_id,false);
  IF s.contract_version <> 2 OR s.status <> 'confirmed' OR s.revision IS DISTINCT FROM p_expected_revision
     OR coalesce(length(btrim(p_reason)),0) = 0 THEN RAISE EXCEPTION 'issue303_invalid_supplement' USING ERRCODE = '23514'; END IF;
  SELECT * INTO v FROM issue303_private.verified_files WHERE id = (p_document->>'verified_file_id')::uuid FOR SHARE;
  IF v.id IS NULL OR v.company_id <> s.company_id OR v.bucket_id <> 'ticket-office-settlements'
     OR v.file_path NOT LIKE s.company_id::text||'/statements/'||s.id::text||'/%'
     OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE id = v.storage_object_id AND bucket_id = v.bucket_id AND name = v.file_path)
     OR EXISTS (SELECT 1 FROM public.ticket_office_statement_documents WHERE verified_file_id = v.id) THEN
    RAISE EXCEPTION 'issue303_new_verified_supplement_required' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM storage.objects WHERE id = v.storage_object_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'issue303_proof_object_missing' USING ERRCODE = '23514'; END IF;
  INSERT INTO issue303_private.command_context VALUES (pg_backend_pid(),txid_current(),s.id,'supplement');
  INSERT INTO public.ticket_office_statement_documents(id,statement_id,company_id,file_path,file_name,mime_type,file_size,document_source,
    created_by,verified_file_id,verified_sha256,supplement_reason)
    VALUES (did,s.id,s.company_id,v.file_path,p_document->>'file_name',p_document->>'mime_type',octet_length(v.bytes),'outro',auth.uid(),v.id,v.sha256,btrim(p_reason));
  DELETE FROM issue303_private.command_context WHERE backend = pg_backend_pid() AND transaction_id = txid_current();
  RETURN did;
END $$;
REVOKE ALL ON FUNCTION public.add_ticket_office_statement_supplement(uuid,bigint,jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_ticket_office_statement_supplement(uuid,bigint,jsonb,text) TO authenticated;

-- Guardas de fontes/fechos: protegem também RPCs legadas DEFINER sem reescrever
-- os corpos da #314. Excepção reverte todos os efeitos SQL do escritor chamador.
CREATE FUNCTION public._issue303_source_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE tid uuid; protected boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'transactions' THEN
    PERFORM issue303_private.lock_source_keys(ARRAY[OLD.id,NEW.id],ARRAY[OLD.invoice_group_id,NEW.invoice_group_id]);
    IF TG_OP <> 'INSERT' THEN
      protected := EXISTS (SELECT 1 FROM issue303_private.source_claims WHERE transaction_id = OLD.id);
      IF OLD.invoice_group_id IS NOT NULL THEN protected := protected OR EXISTS (
        SELECT 1 FROM issue303_private.source_claims c JOIN public.transactions t ON t.id = c.transaction_id WHERE t.invoice_group_id = OLD.invoice_group_id); END IF;
    END IF;
    IF TG_OP <> 'DELETE' AND NEW.invoice_group_id IS NOT NULL THEN protected := protected OR EXISTS (
      SELECT 1 FROM issue303_private.source_claims c JOIN public.transactions t ON t.id = c.transaction_id WHERE t.invoice_group_id = NEW.invoice_group_id); END IF;
    IF (TG_OP <> 'INSERT' AND OLD.settlement_id IS NOT NULL) OR (TG_OP <> 'DELETE' AND NEW.settlement_id IS NOT NULL) THEN
      protected := protected OR EXISTS (SELECT 1 FROM public.ticket_office_settlements s WHERE s.id IN (OLD.settlement_id,NEW.settlement_id)
        AND (public._issue303_account_enabled(s.company_id,s.financial_account_id) OR EXISTS (SELECT 1 FROM public.ticket_office_statement_events WHERE event_id = s.event_id)));
    END IF;
  ELSIF TG_TABLE_NAME = 'ticket_office_settlements' THEN
    IF TG_OP <> 'INSERT' THEN protected := public._issue303_account_enabled(OLD.company_id,OLD.financial_account_id)
      OR EXISTS (SELECT 1 FROM public.ticket_office_statement_events WHERE event_id = OLD.event_id); END IF;
    IF TG_OP <> 'DELETE' THEN protected := protected OR public._issue303_account_enabled(NEW.company_id,NEW.financial_account_id)
      OR EXISTS (SELECT 1 FROM public.ticket_office_statement_events WHERE event_id = NEW.event_id); END IF;
  ELSIF TG_TABLE_NAME IN ('transaction_payments','transaction_documents') THEN
    PERFORM issue303_private.lock_source_keys(ARRAY[OLD.transaction_id,NEW.transaction_id],'{}'::uuid[]);
    IF TG_OP <> 'INSERT' THEN tid := OLD.transaction_id; END IF;
    protected := EXISTS (SELECT 1 FROM issue303_private.source_claims WHERE transaction_id IN (tid,NEW.transaction_id))
      OR EXISTS (SELECT 1 FROM public.transactions t JOIN public.ticket_office_settlements s ON s.id = t.settlement_id
        WHERE t.id IN (tid,NEW.transaction_id) AND (public._issue303_account_enabled(s.company_id,s.financial_account_id)
          OR EXISTS (SELECT 1 FROM public.ticket_office_statement_events WHERE event_id = s.event_id)));
  END IF;
  IF protected THEN RAISE EXCEPTION 'issue303_frozen_source_or_legacy_writer' USING ERRCODE = '42501'; END IF;
  RETURN coalesce(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public._issue303_source_write_guard() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER issue303_source_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public._issue303_source_write_guard();
CREATE TRIGGER issue303_source_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.ticket_office_settlements
  FOR EACH ROW EXECUTE FUNCTION public._issue303_source_write_guard();
CREATE TRIGGER issue303_source_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.transaction_payments
  FOR EACH ROW EXECUTE FUNCTION public._issue303_source_write_guard();
CREATE TRIGGER issue303_source_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.transaction_documents
  FOR EACH ROW EXECUTE FUNCTION public._issue303_source_write_guard();

CREATE FUNCTION public._issue303_evidence_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE b text; path text; fid uuid;
BEGIN
  IF TG_TABLE_SCHEMA = 'issue303_private' THEN
    IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'issue303_verified_bytes_append_only' USING ERRCODE = '42501'; END IF;
    fid := OLD.id;
    IF EXISTS (SELECT 1 FROM public.ticket_office_statement_documents d JOIN public.ticket_office_statements s ON s.id = d.statement_id
        WHERE d.verified_file_id = fid AND s.contract_version = 2 AND s.status = 'confirmed') THEN
      RAISE EXCEPTION 'issue303_evidence_frozen' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'storage_deletion_log' THEN b := NEW.bucket; path := NEW.object_path;
    ELSE b := OLD.bucket_id; path := OLD.name; END IF;
    -- Desde a verificação: um upload não muda entre o hash e a confirmação.
    -- Limpeza futura só pode remover um registo não usado antes do objecto.
    IF EXISTS (SELECT 1 FROM issue303_private.verified_files v WHERE v.bucket_id = b AND v.file_path = path)
       OR (b = 'transaction-documents' AND EXISTS (SELECT 1 FROM public.transaction_documents d
         JOIN issue303_private.source_claims c ON c.transaction_id = d.transaction_id WHERE d.file_url = path)) THEN
      RAISE EXCEPTION 'issue303_evidence_frozen' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN coalesce(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public._issue303_evidence_write_guard() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER issue303_evidence_write_guard BEFORE UPDATE OR DELETE ON issue303_private.verified_files
  FOR EACH ROW EXECUTE FUNCTION public._issue303_evidence_write_guard();
CREATE TRIGGER issue303_evidence_write_guard BEFORE UPDATE OR DELETE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public._issue303_evidence_write_guard();
-- storage-trash escreve o log ANTES de mover; esta guarda impede o arquivo na origem.
CREATE TRIGGER issue303_evidence_write_guard BEFORE INSERT ON public.storage_deletion_log
  FOR EACH ROW EXECUTE FUNCTION public._issue303_evidence_write_guard();

-- Todos os helpers do schema privado permanecem inacessíveis, inclusive service_role.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA issue303_private FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
