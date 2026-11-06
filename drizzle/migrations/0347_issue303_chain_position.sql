-- PREPARADA, NÃO APLICADA — #303 E2b/R4; autorização 6666841381; reserva 6674604617.
-- Base: main e6a702e, R1 + 0345 + 0346; plano §§2.4/3.1–3.3/7, Q1–Q6 e SaaS.
-- Não executar nem activar contas. Sem seed/backfill ou escrita financeira.
-- Os comandos/ACL/locks da 0346 ficam intactos: conta -> pais UUID -> eventos UUID
-- -> provas/fontes. r4_validate é privado e só é chamado depois desses locks.
BEGIN;

-- Factos documentais do verificador backend, ligados aos bytes imutáveis da 0346.
-- Não são campos do pedido de draft nem uma atestação de hash feita pelo cliente.
-- A linha é obrigatória: pdf_local_at NULL atesta PDF só com data, não ausência
-- de extracção. Sem esta prova recusa, em vez de ignorar uma possível hora do PDF.
-- Uma linha sem hora explícita pode atestar o universo de recebimentos de um
-- predecessor positivo: NULL = desconhecido; true + zero receipt_sources = não recebido.
-- O verificador futuro tem de conferir o PDF e a cobertura dos recebimentos;
-- esta migração não o implementa, não insere provas e não concede acesso por RPC.
CREATE TABLE issue303_private.position_evidence (
  verified_file_id uuid PRIMARY KEY REFERENCES issue303_private.verified_files(id),
  pdf_local_at timestamp,
  pdf_timezone text,
  document_page integer NOT NULL CHECK (document_page > 0),
  document_ref text NOT NULL CHECK (length(btrim(document_ref)) > 0),
  receipts_complete boolean NOT NULL DEFAULT false,
  CHECK (pdf_local_at IS NULL OR isfinite(pdf_local_at)),
  CHECK (pdf_timezone IS NULL OR (pdf_local_at IS NOT NULL AND length(btrim(pdf_timezone)) > 0))
);
-- Recebimentos anteriores ao documento, já abatidos no transitado positivo.
-- São fontes concretas 10.3, nunca um valor de saldo declarado pelo verificador.
CREATE TABLE issue303_private.receipt_sources (
  transaction_id uuid PRIMARY KEY REFERENCES public.transactions(id),
  verified_file_id uuid NOT NULL REFERENCES issue303_private.position_evidence(verified_file_id),
  predecessor_statement_id uuid NOT NULL REFERENCES public.ticket_office_statements(id)
);
REVOKE ALL ON TABLE issue303_private.position_evidence, issue303_private.receipt_sources
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION issue303_private.position_evidence_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'issue303_position_evidence_append_only' USING ERRCODE = '42501';
  END IF;
  -- Mesmo lock dos bytes adquirido pela confirmação: não acrescentar uma hora ou
  -- recebimento depois de a confirmação ter lido a ausência dessa metainformação.
  PERFORM 1 FROM issue303_private.verified_files WHERE id = NEW.verified_file_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.ticket_office_statement_documents d
      JOIN public.ticket_office_statements s ON s.id = d.statement_id
      WHERE d.verified_file_id = NEW.verified_file_id AND s.status = 'confirmed') THEN
    RAISE EXCEPTION 'issue303_position_evidence_frozen' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'receipt_sources' THEN
    PERFORM issue303_private.lock_source_keys(ARRAY[NEW.transaction_id],'{}'::uuid[]);
    PERFORM 1 FROM public.transactions WHERE id = NEW.transaction_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM issue303_private.source_claims WHERE transaction_id = NEW.transaction_id)
       OR EXISTS (SELECT 1 FROM public.ticket_office_statement_lines used
         JOIN public.transactions t ON t.id = NEW.transaction_id
         WHERE used.transaction_id = t.id OR (used.invoice_group_id IS NOT NULL AND used.invoice_group_id = t.invoice_group_id)) THEN
      RAISE EXCEPTION 'issue303_source_already_used' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER issue303_position_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON issue303_private.position_evidence
  FOR EACH ROW EXECUTE FUNCTION issue303_private.position_evidence_guard();
CREATE TRIGGER issue303_position_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON issue303_private.receipt_sources
  FOR EACH ROW EXECUTE FUNCTION issue303_private.position_evidence_guard();

-- Completa a guarda da 0346 para estas fontes que não são linhas financeiras do
-- documento (o recebimento já está abatido no carry_over). A mesma chave de fonte
-- serializa a reserva backend e os escritores; nenhuma transacção é alterada aqui.
CREATE FUNCTION issue303_private.receipt_source_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE ids uuid[]; accounts uuid[];
BEGIN
  IF TG_TABLE_NAME = 'transactions' THEN
    ids := ARRAY[OLD.id,NEW.id]; accounts := ARRAY[OLD.account_id,NEW.account_id];
  ELSIF TG_TABLE_NAME = 'ticket_office_statement_lines' THEN
    ids := ARRAY(SELECT id FROM public.transactions WHERE id IN (OLD.transaction_id,NEW.transaction_id)
      OR invoice_group_id IN (OLD.invoice_group_id,NEW.invoice_group_id));
    accounts := ARRAY(SELECT account_id FROM public.transactions WHERE id = ANY(ids));
  ELSE
    ids := ARRAY[OLD.transaction_id,NEW.transaction_id];
    accounts := ARRAY(SELECT account_id FROM public.transactions WHERE id = ANY(ids));
    IF TG_TABLE_NAME = 'transaction_payments' THEN accounts := accounts || ARRAY[OLD.account_id,NEW.account_id]; END IF;
  END IF;
  -- Também os movimentos ainda não seleccionados serializam com a fotografia
  -- da conta: um INSERT/retrodatação não pode surgir entre a prova e o recibo.
  -- Contas desligadas não adquirem este lock adicional.
  PERFORM 1 FROM public.financial_accounts a WHERE a.id = ANY(accounts)
    AND public._issue303_account_enabled(a.company_id,a.id) ORDER BY a.id FOR UPDATE;
  PERFORM issue303_private.lock_source_keys(ids,'{}'::uuid[]);
  IF EXISTS (SELECT 1 FROM issue303_private.receipt_sources WHERE transaction_id = ANY(ids)) THEN
    RAISE EXCEPTION 'issue303_receipt_source_frozen' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER issue303_receipt_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION issue303_private.receipt_source_guard();
CREATE TRIGGER issue303_receipt_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.transaction_payments
  FOR EACH ROW EXECUTE FUNCTION issue303_private.receipt_source_guard();
CREATE TRIGGER issue303_receipt_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.transaction_documents
  FOR EACH ROW EXECUTE FUNCTION issue303_private.receipt_source_guard();
CREATE TRIGGER issue303_receipt_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.ticket_office_statement_lines
  FOR EACH ROW EXECUTE FUNCTION issue303_private.receipt_source_guard();

-- Datas de pagamentos são dias civis, não instantes inventados à meia-noite.
-- Sem um dia completamente coberto pelo corte, a prova é insuficiente. Não usar
-- paid_amount actual como se fosse um histórico; somar os pagamentos datados.
CREATE FUNCTION issue303_private.dated_source(p_transaction uuid, p_company uuid, p_account uuid,
  p_cutoff timestamptz, p_timezone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE t public.transactions; paid numeric; proofs jsonb; snapshot jsonb;
BEGIN
  SELECT * INTO t FROM public.transactions WHERE id = p_transaction FOR SHARE;
  IF t.id IS NULL OR t.company_id IS DISTINCT FROM p_company OR t.account_id IS DISTINCT FROM p_account
     OR t.currency IS DISTINCT FROM 'EUR' OR t.reversed_at IS NOT NULL OR t.is_hidden IS DISTINCT FROM false
     OR t.status IS DISTINCT FROM 'paid' OR t.type NOT IN ('income','expense') THEN
    RAISE EXCEPTION 'issue303_position_invalid_source: fonte fora da empresa/conta ou inutilizável' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.transaction_payments WHERE transaction_id = t.id ORDER BY id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM public.transaction_payments WHERE transaction_id = t.id)
     OR EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = t.id
       AND (p.company_id IS DISTINCT FROM p_company OR p.account_id IS DISTINCT FROM p_account
         OR p.currency IS DISTINCT FROM 'EUR' OR p.status IS DISTINCT FROM 'paid' OR p.reversed_at IS NOT NULL
         OR p.payment_date IS NULL OR NOT isfinite(p.payment_date) OR p.amount IS NULL OR p.amount <= 0
         OR p.amount::text IN ('NaN','Infinity','-Infinity') OR p.amount <> trunc(p.amount,2)
         OR ((p.payment_date + 1)::timestamp AT TIME ZONE p_timezone) > p_cutoff)) THEN
    RAISE EXCEPTION 'issue303_position_dated_source_required: pagamentos sem cobertura temporal integral no corte' USING ERRCODE = '23514';
  END IF;
  SELECT sum(amount),jsonb_agg(jsonb_build_object('id',p.id,'transaction_id',p.transaction_id,
    'company_id',p.company_id,'account_id',p.account_id,'currency',p.currency,'status',p.status,
    'amount',p.amount,'payment_date',p.payment_date,'reversed_at',p.reversed_at) ORDER BY id) INTO paid,proofs
    FROM public.transaction_payments p WHERE transaction_id = t.id;
  IF paid IS DISTINCT FROM t.amount OR paid IS DISTINCT FROM t.paid_amount THEN
    RAISE EXCEPTION 'issue303_position_payment_residue: pagamentos não explicam integralmente a fonte' USING ERRCODE = '23514';
  END IF;
  -- Allowlist financeira: não copiar IBAN, descrições livres ou dados de pagamento
  -- desnecessários do registo completo para um novo documento/consumidor.
  snapshot := jsonb_build_object('id',t.id,'company_id',t.company_id,'account_id',t.account_id,
    'event_id',t.event_id,'invoice_group_id',t.invoice_group_id,'category_id',t.category_id,
    'currency',t.currency,'type',t.type,'status',t.status,'amount',t.amount,'paid_amount',t.paid_amount,
    'payment_date',t.payment_date,'reversed_at',t.reversed_at,'is_hidden',t.is_hidden);
  RETURN jsonb_build_object('kind','transaction','transaction_id',t.id,
    'amount',CASE WHEN t.type = 'expense' THEN -paid ELSE paid END,
    'transaction',snapshot,'payments',proofs,
    'sha256',encode(sha256(convert_to(jsonb_build_array(snapshot,proofs)::text,'UTF8')),'hex'));
END $$;

CREATE OR REPLACE FUNCTION issue303_private.r4_validate(p_statement uuid, p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  s public.ticket_office_statements; prev public.ticket_office_statements; node public.ticket_office_statements;
  evidence issue303_private.position_evidence; file_id uuid; zone text; cut timestamptz; source text := 'company_day_end';
  pdf_zone text; offset_parts text[]; offset_minutes integer; visited uuid[] := '{}'; cursor_id uuid;
  newer_cutoff timestamptz; newer_date date;
  base numeric := 0; received numeric := 0; rights numeric := 0; adjustments numeric := 0; advances numeric := 0;
  independent numeric; carry numeric; carry_count integer; opening_count integer; opening_amount numeric;
  l record; tx record; close public.ticket_office_settlements; proof jsonb; snapshot jsonb; sources jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO STRICT s FROM public.ticket_office_statements WHERE id = p_statement;
  PERFORM issue303_private.assert_actor(s.company_id,s.financial_account_id,true);
  IF s.contract_version <> 2 OR s.status <> 'draft' OR s.revision IS DISTINCT FROM p_revision THEN
    RAISE EXCEPTION 'issue303_revision_or_state_conflict' USING ERRCODE = '40001';
  END IF;
  SELECT timezone INTO zone FROM public.companies WHERE id = s.company_id;
  IF zone IS NULL OR btrim(zone) = '' THEN
    RAISE EXCEPTION 'issue303_company_timezone_missing: configurar o fuso IANA da empresa' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = zone) THEN
    RAISE EXCEPTION 'issue303_company_timezone_invalid: fuso IANA da empresa inválido' USING ERRCODE = '23514';
  END IF;
  -- Congelar também a classificação: alterar o código de uma rubrica não pode
  -- retirar um repasse do universo entre a validação da 0346 e esta fotografia.
  PERFORM 1 FROM public.account_categories WHERE company_id = s.company_id ORDER BY id FOR SHARE;
  PERFORM issue303_private.validate_references(s.id);
  SELECT verified_file_id INTO file_id FROM public.ticket_office_statement_documents
    WHERE id = s.primary_document_id AND statement_id = s.id;
  SELECT * INTO evidence FROM issue303_private.position_evidence WHERE verified_file_id = file_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue303_position_cutoff_evidence_required: falta conferir se o PDF indica hora explícita' USING ERRCODE = '23514';
  END IF;
  cut := (s.statement_date + 1)::timestamp AT TIME ZONE zone;
  IF evidence.pdf_local_at IS NOT NULL THEN
    source := 'pdf_explicit';
    pdf_zone := coalesce(evidence.pdf_timezone,zone);
    IF evidence.pdf_local_at::date IS DISTINCT FROM s.statement_date THEN
      RAISE EXCEPTION 'issue303_pdf_cutoff_date_mismatch' USING ERRCODE = '23514';
    END IF;
    offset_parts := regexp_match(pdf_zone,'^([+-])([0-9]{2}):([0-9]{2})$');
    IF offset_parts IS NOT NULL THEN
      IF offset_parts[2]::integer > 14 OR offset_parts[3]::integer > 59
         OR (offset_parts[2]::integer = 14 AND offset_parts[3]::integer <> 0) THEN
        RAISE EXCEPTION 'issue303_pdf_timezone_invalid' USING ERRCODE = '23514';
      END IF;
      offset_minutes := (offset_parts[2]::integer * 60 + offset_parts[3]::integer)
        * CASE offset_parts[1] WHEN '-' THEN -1 ELSE 1 END;
      cut := (evidence.pdf_local_at - make_interval(mins => offset_minutes)) AT TIME ZONE 'UTC';
    ELSIF EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = pdf_zone) THEN
      cut := evidence.pdf_local_at AT TIME ZONE pdf_zone;
      -- Lacunas/horas repetidas exigem offset documental, nunca escolha silenciosa.
      IF cut AT TIME ZONE pdf_zone IS DISTINCT FROM evidence.pdf_local_at OR EXISTS (
        SELECT 1 FROM generate_series(-180,180) minutes
        WHERE minutes <> 0 AND (cut + minutes * interval '1 minute') AT TIME ZONE pdf_zone = evidence.pdf_local_at) THEN
        RAISE EXCEPTION 'issue303_pdf_timezone_ambiguous: indicar offset documental explícito' USING ERRCODE = '23514';
      END IF;
    ELSE RAISE EXCEPTION 'issue303_pdf_timezone_invalid' USING ERRCODE = '23514'; END IF;
  END IF;

  -- Todos os confirmados têm de formar exactamente a ascendência seleccionada.
  -- Não bloquear novos pais depois dos eventos: v2 confirmado já é imutável pela
  -- 0346 e a conta está bloqueada. Histórico v1 sem recibo independente recusa.
  cursor_id := s.predecessor_statement_id;
  WHILE cursor_id IS NOT NULL LOOP
    IF cursor_id = s.id OR cursor_id = ANY(visited) THEN
      RAISE EXCEPTION 'issue303_chain_cycle' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO node FROM public.ticket_office_statements WHERE id = cursor_id;
    IF node.id IS NULL OR node.status <> 'confirmed' OR node.company_id <> s.company_id
       OR node.financial_account_id <> s.financial_account_id THEN
      RAISE EXCEPTION 'issue303_chain_invalid_predecessor' USING ERRCODE = '23514';
    END IF;
    IF node.contract_version <> 2 OR node.confirmation_receipt->'position_proof'->>'validator' IS DISTINCT FROM 'issue303-r4-v1'
       OR node.confirmation_receipt->'position_proof'->'independent_position' IS DISTINCT FROM to_jsonb(node.document_total)
       OR node.confirmation_receipt->'position_proof'->>'position_cutoff_at' IS NULL THEN
      RAISE EXCEPTION 'issue303_chain_documented_base_required: predecessor sem posição independente documentada' USING ERRCODE = '23514';
    END IF;
    IF cardinality(visited) = 0 THEN prev := node;
    ELSIF node.position_cutoff_at >= newer_cutoff OR node.statement_date >= newer_date THEN
      RAISE EXCEPTION 'issue303_chain_cutoff_order' USING ERRCODE = '23514';
    END IF;
    newer_cutoff := node.position_cutoff_at;
    newer_date := node.statement_date;
    visited := array_append(visited,node.id);
    cursor_id := node.predecessor_statement_id;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.ticket_office_statements WHERE company_id = s.company_id
      AND financial_account_id = s.financial_account_id AND status = 'confirmed' AND NOT (id = ANY(visited))) THEN
    RAISE EXCEPTION 'issue303_chain_predecessor_required: predecessor confirmado obrigatório, mesmo com saldo zero' USING ERRCODE = '23514';
  END IF;
  IF prev.id IS NOT NULL AND (cut <= prev.position_cutoff_at OR s.statement_date <= prev.statement_date) THEN
    RAISE EXCEPTION 'issue303_chain_cutoff_order: o sucessor deve ter data e corte posteriores' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ticket_office_statements WHERE predecessor_statement_id = prev.id AND id <> s.id) THEN
    RAISE EXCEPTION 'issue303_chain_successor_already_exists' USING ERRCODE = '23505';
  END IF;
  SELECT count(*),sum(amount) INTO opening_count,opening_amount FROM public.ticket_office_statement_lines
    WHERE statement_id = s.id AND document_line_type = 'opening_balance';
  SELECT count(*),sum(amount) INTO carry_count,carry FROM public.ticket_office_statement_lines
    WHERE statement_id = s.id AND document_line_type = 'carry_over';
  IF opening_count > 0 AND prev.id IS NOT NULL THEN
    RAISE EXCEPTION 'issue303_chain_opening_first_only' USING ERRCODE = '23514';
  END IF;
  IF prev.id IS NULL THEN
    IF carry_count > 0 THEN RAISE EXCEPTION 'issue303_chain_carry_without_predecessor' USING ERRCODE = '23514'; END IF;
    base := coalesce(opening_amount,0);
    sources := sources || jsonb_build_array(jsonb_build_object('kind',CASE WHEN opening_count = 1 THEN 'approved_opening' ELSE 'first_document' END,
      'amount',base,'opening_line',(SELECT to_jsonb(o) FROM public.ticket_office_statement_lines o
        WHERE statement_id = s.id AND document_line_type = 'opening_balance')));
  ELSE
    base := (prev.confirmation_receipt->'position_proof'->>'independent_position')::numeric;
    IF base > 0 AND NOT coalesce(evidence.receipts_complete,false) THEN
      RAISE EXCEPTION 'issue303_positive_outstanding_proof_required: falta prova de recebimentos do saldo positivo' USING ERRCODE = '23514';
    END IF;
    FOR tx IN SELECT r.*,t.category_id,t.payment_date FROM issue303_private.receipt_sources r
        JOIN public.transactions t ON t.id = r.transaction_id WHERE r.verified_file_id = file_id ORDER BY r.transaction_id LOOP
      IF base <= 0 OR tx.predecessor_statement_id <> prev.id OR tx.payment_date IS NULL
         OR EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = tx.transaction_id
           AND (p.payment_date::timestamp AT TIME ZONE zone) < prev.position_cutoff_at)
         OR NOT EXISTS (SELECT 1 FROM public.account_categories WHERE id = tx.category_id AND company_id = s.company_id AND code = '10.3')
         OR EXISTS (SELECT 1 FROM issue303_private.line_sources(s.id) x WHERE x.transaction_id = tx.transaction_id) THEN
        RAISE EXCEPTION 'issue303_invalid_predecessor_receipt' USING ERRCODE = '23514';
      END IF;
      proof := issue303_private.dated_source(tx.transaction_id,s.company_id,s.financial_account_id,cut,zone);
      IF (proof->>'amount')::numeric >= 0 THEN RAISE EXCEPTION 'issue303_invalid_predecessor_receipt' USING ERRCODE = '23514'; END IF;
      received := received - (proof->>'amount')::numeric;
      sources := sources || jsonb_build_array(proof || jsonb_build_object('kind','predecessor_receipt'));
    END LOOP;
    IF received > greatest(base,0) THEN RAISE EXCEPTION 'issue303_predecessor_receipt_exceeds_balance' USING ERRCODE = '23514'; END IF;
    base := base - received;
    IF (base = 0 AND carry_count <> 0) OR (base <> 0 AND (carry_count <> 1 OR carry IS DISTINCT FROM base))
       OR EXISTS (SELECT 1 FROM public.ticket_office_statement_lines WHERE statement_id = s.id
          AND document_line_type = 'carry_over' AND previous_statement_id IS DISTINCT FROM prev.id) THEN
      RAISE EXCEPTION 'issue303_chain_carry_mismatch: transitado difere do saldo anterior em aberto, com sinal' USING ERRCODE = '23514';
    END IF;
    sources := sources || jsonb_build_array(jsonb_build_object('kind','predecessor','statement_id',prev.id,'amount',base,
      'received',received,'receipt_sha256',encode(sha256(convert_to(prev.confirmation_receipt::text,'UTF8')),'hex')));
  END IF;
  IF prev.id IS NULL AND EXISTS (SELECT 1 FROM issue303_private.receipt_sources WHERE verified_file_id = file_id) THEN
    RAISE EXCEPTION 'issue303_invalid_predecessor_receipt' USING ERRCODE = '23514';
  END IF;

  -- Provar o universo, não apenas a soma do subconjunto escolhido pelo cliente.
  -- No arranque sem abertura cobrir todo o passado datado; num sucessor cobrir
  -- o intervalo desde o recibo anterior. A abertura manual documenta a excepção
  -- histórica, sem fingir que os movimentos anteriores foram reconstruídos.
  IF prev.id IS NOT NULL OR opening_count = 0 THEN
    IF EXISTS (SELECT 1 FROM public.ticket_office_settlements c
        WHERE c.company_id = s.company_id AND c.financial_account_id = s.financial_account_id
          AND c.status = 'confirmed' AND (c.closed_at IS NULL OR (c.closed_at < cut
            AND (prev.id IS NULL OR c.closed_at >= prev.position_cutoff_at)))
          AND NOT EXISTS (SELECT 1 FROM public.ticket_office_statement_lines quota
            WHERE quota.statement_id = s.id AND quota.document_line_type = 'event_sales' AND quota.event_id = c.event_id)
          AND NOT EXISTS (SELECT 1 FROM public.ticket_office_statement_events e
            WHERE e.event_id = c.event_id AND e.statement_id = ANY(visited))) THEN
      RAISE EXCEPTION 'issue303_position_unexplained_event: direito apurado fora do universo documental; falta base ou documento' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.transactions t JOIN public.account_categories cat ON cat.id = t.category_id
        WHERE t.company_id = s.company_id AND t.account_id = s.financial_account_id
          AND cat.company_id = s.company_id AND cat.code = '10.3' AND t.type = 'expense'
          AND t.status IN ('paid','approved') AND t.reversed_at IS NULL AND NOT t.is_hidden AND t.paid_amount > 0
          AND (t.payment_date IS NULL OR ((t.payment_date::timestamp AT TIME ZONE zone) < cut
            AND (prev.id IS NULL OR ((t.payment_date + 1)::timestamp AT TIME ZONE zone) > prev.position_cutoff_at))
            OR EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = t.id AND p.status = 'paid'
              AND p.reversed_at IS NULL AND p.amount > 0 AND (p.payment_date::timestamp AT TIME ZONE zone) < cut
              AND (prev.id IS NULL OR ((p.payment_date + 1)::timestamp AT TIME ZONE zone) > prev.position_cutoff_at)))
          AND NOT EXISTS (SELECT 1 FROM issue303_private.line_sources(s.id) x WHERE x.transaction_id = t.id)
          AND NOT EXISTS (SELECT 1 FROM issue303_private.receipt_sources r WHERE r.transaction_id = t.id AND r.verified_file_id = file_id)
          AND NOT EXISTS (SELECT 1 FROM issue303_private.source_claims claim
            WHERE claim.transaction_id = t.id AND claim.statement_id = ANY(visited))) THEN
      RAISE EXCEPTION 'issue303_position_unexplained_advance: repasse 10.3 fora do universo documental; falta base ou fonte' USING ERRCODE = '23514';
    END IF;
  END IF;

  FOR l IN SELECT * FROM public.ticket_office_statement_lines WHERE statement_id = s.id ORDER BY position LOOP
    IF l.document_line_type = 'event_sales' THEN
      SELECT * INTO close FROM public.ticket_office_settlements WHERE id = l.ticket_office_settlement_id FOR SHARE;
      IF close.id IS NULL OR close.company_id <> s.company_id OR close.financial_account_id <> s.financial_account_id
         OR close.event_id <> l.event_id OR close.status <> 'confirmed' OR close.closed_at IS NULL OR close.closed_at >= cut
         OR close.settlement_date IS NULL OR close.settlement_date > s.statement_date
         OR coalesce(close.net_adjusted,close.net_calculated) IS NULL
         OR coalesce(close.net_adjusted,close.net_calculated)::text IN ('NaN','Infinity','-Infinity')
         OR coalesce(close.net_adjusted,close.net_calculated) <> trunc(coalesce(close.net_adjusted,close.net_calculated),2)
         OR (close.net_adjusted IS NOT NULL AND coalesce(length(btrim(close.adjustment_notes)),0) = 0) THEN
        RAISE EXCEPTION 'issue303_position_event_source_required: falta direito final datado do evento no corte' USING ERRCODE = '23514';
      END IF;
      IF coalesce(close.net_adjusted,close.net_calculated) IS DISTINCT FROM l.declared_event_net THEN
        RAISE EXCEPTION 'issue303_position_event_residue: quota documental difere do direito independente do evento' USING ERRCODE = '23514';
      END IF;
      rights := rights + coalesce(close.net_adjusted,close.net_calculated);
      snapshot := jsonb_build_object('id',close.id,'company_id',close.company_id,'financial_account_id',close.financial_account_id,
        'event_id',close.event_id,'status',close.status,'closed_at',close.closed_at,'settlement_date',close.settlement_date,
        'net_calculated',close.net_calculated,'net_adjusted',close.net_adjusted,
        'adjustment_reason_sha256',encode(sha256(convert_to(close.adjustment_notes,'UTF8')),'hex'));
      sources := sources || jsonb_build_array(jsonb_build_object('kind','event_right','event_id',l.event_id,'line_id',l.id,
        'amount',coalesce(close.net_adjusted,close.net_calculated),'settlement',snapshot,
        'sha256',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex')));
    ELSIF l.document_line_type IN ('advance','ticketline_invoice','venue_settlement') THEN
      IF l.transaction_id IS NULL AND l.invoice_group_id IS NULL THEN
        RAISE EXCEPTION 'issue303_position_source_missing: acerto sem movimento datado independente' USING ERRCODE = '23514';
      END IF;
      FOR tx IN SELECT t.id FROM public.transactions t WHERE t.id = l.transaction_id
          OR (l.invoice_group_id IS NOT NULL AND t.invoice_group_id = l.invoice_group_id) ORDER BY t.id LOOP
        IF EXISTS (SELECT 1 FROM issue303_private.receipt_sources WHERE transaction_id = tx.id) THEN
          RAISE EXCEPTION 'issue303_source_already_used' USING ERRCODE = '23505';
        END IF;
        IF l.document_line_type = 'advance' AND prev.id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = tx.id
              AND (p.payment_date::timestamp AT TIME ZONE zone) < prev.position_cutoff_at) THEN
          RAISE EXCEPTION 'issue303_position_advance_before_predecessor: repasse anterior já pertence à base documentada; não subtrair novamente' USING ERRCODE = '23514';
        END IF;
        proof := issue303_private.dated_source(tx.id,s.company_id,s.financial_account_id,cut,zone);
        sources := sources || jsonb_build_array(proof || jsonb_build_object('line_id',l.id,'quota_line_id',l.quota_line_id));
        IF l.document_line_type = 'advance' THEN advances := advances - (proof->>'amount')::numeric;
        ELSIF l.quota_line_id IS NULL THEN adjustments := adjustments + (proof->>'amount')::numeric; END IF;
      END LOOP;
    END IF;
  END LOOP;
  independent := base + rights + adjustments - advances;
  IF independent IS DISTINCT FROM s.document_total OR independent IS DISTINCT FROM
      (SELECT sum(amount) FROM public.ticket_office_statement_lines WHERE statement_id = s.id) THEN
    RAISE EXCEPTION 'issue303_position_unexplained_residue: posição independente não coincide com o universo documental' USING ERRCODE = '23514';
  END IF;
  RETURN jsonb_build_object('validator','issue303-r4-v1','contract_version',2,'statement_id',s.id,'revision',s.revision,
    'position_cutoff_at',cut,'position_timezone',zone,'position_cutoff_source',source,
    'pdf_timezone',pdf_zone,'pdf_evidence',to_jsonb(evidence),'primary_document_sha256',s.primary_document_sha256,
    'independent_position',independent,'components',jsonb_build_object('base',base,'event_rights',rights,
      'adjustments',adjustments,'advances',advances),'sources',sources);
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA issue303_private FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
