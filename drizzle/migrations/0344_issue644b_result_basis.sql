-- PREPARADA, NÃO APLICADA — #644b B1; autorização 6670082654, reserva 6672282283.
-- Plano docs/testes/issue644/plano-644b.md §§2/4/B1, main f7d53de; Q1–Q4=A (6671483519).
-- Só estrutura. Sem DML, backfill, RPC, alteração de events ou activação do fecho.
-- Aplicação futura atómica pelo 0; não executar por este despacho.
-- B3 terá de substituir o bloqueio INCONDICIONAL do escritor por contexto privado
-- do comando close_event, validado no backend/transacção (nunca role/GUC isolado).

CREATE SCHEMA issue644b_private;
REVOKE ALL ON SCHEMA issue644b_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.event_result_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  closure_root_event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  -- A revisão da raiz identifica a operação de toda a família, incluindo a própria raiz.
  root_closure_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  closed_at timestamptz NOT NULL CHECK (isfinite(closed_at)),
  closed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  captured_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  captured_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  capture_kind text NOT NULL CHECK (capture_kind IN ('close_event','legacy_reconstruction','legacy_confirmation')),
  schema_version integer NOT NULL CHECK (schema_version = 1),
  criterion_version integer CHECK (criterion_version = 1),
  criterion_sha256 text CHECK (criterion_sha256 ~ '^[0-9a-f]{64}$'),
  basis_status text NOT NULL CHECK (basis_status IN ('recorded','reconstructed','unknown')),
  budget_mode_resolved text CHECK (budget_mode_resolved IN ('with_bp','without_bp')),
  budget_mode_source text CHECK (budget_mode_source IN ('event','company','platform_default')),
  expense_source text CHECK (expense_source IN ('realized','committed')),
  expense_source_original text CHECK (expense_source_original IN ('realized','committed')),
  cost_include_overhead boolean,
  partner_calc_basis text CHECK (partner_calc_basis IN ('net_result','net_result_gross_expenses','gross_revenue')),
  result_revenue_vat_basis text CHECK (result_revenue_vat_basis = 'net'),
  result_expense_vat_basis text CHECK (result_expense_vat_basis IN ('net','gross','excluded')),
  revenue_policy text CHECK (revenue_policy IN ('real_then_bp_by_bucket','real_only')),
  revenue_policy_version integer CHECK (revenue_policy_version = 1),
  revenue_include_overhead boolean CHECK (revenue_include_overhead = false),
  final_bp_version_id uuid REFERENCES public.bp_versions(id) ON DELETE RESTRICT,
  perimeter_kind text NOT NULL CHECK (perimeter_kind IN ('event','city','family')),
  result_origin text CHECK (result_origin IN ('seal_snapshot','canonical_current_inputs')),
  -- Evidência por campo; ausência de prova é NULL + nome explícito em unknown_fields.
  field_evidence jsonb NOT NULL CHECK (jsonb_typeof(field_evidence) = 'object'),
  unknown_fields text[] NOT NULL CHECK (array_position(unknown_fields, NULL) IS NULL),
  provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  previous_closure_id uuid,
  confirmation_receipt_id uuid,
  CONSTRAINT result_closure_revision_key UNIQUE (event_id, revision),
  CONSTRAINT result_closure_identity_key UNIQUE (id, company_id, event_id),
  CONSTRAINT result_closure_operation_key UNIQUE (id, company_id, event_id, closed_at),
  CONSTRAINT result_closure_root_fk FOREIGN KEY (root_closure_id, company_id, closure_root_event_id, closed_at)
    REFERENCES public.event_result_closures(id, company_id, event_id, closed_at)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT result_closure_previous_fk FOREIGN KEY (previous_closure_id, company_id, event_id)
    REFERENCES public.event_result_closures(id, company_id, event_id) ON DELETE RESTRICT,
  CONSTRAINT result_closure_root_shape CHECK (
    (event_id = closure_root_event_id AND root_closure_id = id AND perimeter_kind IN ('event','family'))
    OR (event_id <> closure_root_event_id AND root_closure_id <> id AND perimeter_kind = 'city')),
  CONSTRAINT result_closure_capture_status CHECK (
    (capture_kind = 'close_event' AND basis_status = 'recorded' AND closed_by IS NOT NULL
      AND captured_by = closed_by AND cardinality(unknown_fields) = 0 AND confirmation_receipt_id IS NULL)
    OR (capture_kind = 'legacy_reconstruction' AND basis_status IN ('reconstructed','unknown')
      AND confirmation_receipt_id IS NULL)
    OR (capture_kind = 'legacy_confirmation' AND basis_status = 'reconstructed'
      AND previous_closure_id IS NOT NULL AND confirmation_receipt_id IS NOT NULL
      AND cardinality(unknown_fields) = 0)),
  CONSTRAINT result_closure_unknown_status CHECK (
    (basis_status = 'unknown' AND cardinality(unknown_fields) > 0)
    OR (basis_status IN ('recorded','reconstructed') AND cardinality(unknown_fields) = 0)),
  CONSTRAINT result_closure_mode_coherence CHECK (
    (budget_mode_resolved IS DISTINCT FROM 'without_bp' OR
      ((expense_source IS NULL OR expense_source = 'realized') AND (revenue_policy IS NULL OR revenue_policy = 'real_only')))
    AND (budget_mode_resolved IS DISTINCT FROM 'with_bp' OR revenue_policy IS NULL OR revenue_policy = 'real_then_bp_by_bucket')),
  CONSTRAINT result_closure_vat_coherence CHECK (
    partner_calc_basis IS NULL OR result_expense_vat_basis IS NULL OR
    (partner_calc_basis = 'net_result' AND result_expense_vat_basis = 'net') OR
    (partner_calc_basis = 'net_result_gross_expenses' AND result_expense_vat_basis = 'gross') OR
    (partner_calc_basis = 'gross_revenue' AND result_expense_vat_basis = 'excluded'))
);
CREATE INDEX result_closure_company_event_idx ON public.event_result_closures(company_id, event_id, revision DESC);
CREATE INDEX result_closure_family_idx ON public.event_result_closures(company_id, root_closure_id, event_id);
CREATE INDEX result_closure_bp_idx ON public.event_result_closures(final_bp_version_id) WHERE final_bp_version_id IS NOT NULL;

-- Referências normalizadas: um selo pode suportar várias revisões, sem copiar montantes.
-- A identidade/hash do selo é histórica; mudanças futuras do nó não reescrevem esta prova.
-- A validação do contrato/revisão #415 pertence ao comando B3, após catálogo aprovado.
CREATE TABLE public.event_result_closure_seals (
  closure_id uuid NOT NULL,
  company_id uuid NOT NULL,
  event_id uuid NOT NULL,
  settlement_id uuid NOT NULL REFERENCES public.event_settlements(id) ON DELETE RESTRICT,
  sealed_at timestamptz NOT NULL CHECK (isfinite(sealed_at)),
  seal_schema_version integer NOT NULL CHECK (seal_schema_version > 0),
  seal_sha256 text NOT NULL CHECK (seal_sha256 ~ '^[0-9a-f]{64}$'),
  bp_version_id uuid REFERENCES public.bp_versions(id) ON DELETE RESTRICT,
  node_basis_evidence jsonb NOT NULL CHECK (jsonb_typeof(node_basis_evidence) = 'object'),
  PRIMARY KEY (closure_id, settlement_id),
  FOREIGN KEY (closure_id, company_id, event_id)
    REFERENCES public.event_result_closures(id, company_id, event_id) ON DELETE RESTRICT
);
CREATE INDEX result_closure_seal_event_idx ON public.event_result_closure_seals(company_id, event_id, closure_id);
CREATE INDEX result_closure_seal_node_idx ON public.event_result_closure_seals(settlement_id);
CREATE INDEX result_closure_seal_bp_idx ON public.event_result_closure_seals(bp_version_id) WHERE bp_version_id IS NOT NULL;

CREATE TABLE public.event_result_closure_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id uuid NOT NULL,
  company_id uuid NOT NULL,
  event_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('closed','reopened','legacy_reopened','reconstructed','confirmed')),
  occurred_at timestamptz NOT NULL DEFAULT statement_timestamp() CHECK (isfinite(occurred_at)),
  performed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  replacement_closure_id uuid,
  FOREIGN KEY (closure_id, company_id, event_id)
    REFERENCES public.event_result_closures(id, company_id, event_id) ON DELETE RESTRICT,
  FOREIGN KEY (replacement_closure_id, company_id, event_id)
    REFERENCES public.event_result_closures(id, company_id, event_id) ON DELETE RESTRICT,
  CONSTRAINT result_closure_log_identity_key UNIQUE (id, closure_id, company_id, event_id),
  CONSTRAINT result_closure_log_confirmation CHECK (
    (action = 'confirmed' AND replacement_closure_id IS NOT NULL AND replacement_closure_id <> closure_id)
    OR (action <> 'confirmed' AND replacement_closure_id IS NULL))
);
CREATE UNIQUE INDEX result_closure_initial_receipt_key ON public.event_result_closure_log(closure_id)
  WHERE action IN ('closed','reconstructed');
CREATE UNIQUE INDEX result_closure_reopen_receipt_key ON public.event_result_closure_log(closure_id)
  WHERE action IN ('reopened','legacy_reopened');
CREATE INDEX result_closure_log_event_idx ON public.event_result_closure_log(company_id, event_id, occurred_at DESC, id);
-- A confirmação aponta ao recibo da revisão anterior, com autoria/data reais preservadas.
ALTER TABLE public.event_result_closures ADD CONSTRAINT result_closure_confirmation_fk
  FOREIGN KEY (confirmation_receipt_id, previous_closure_id, company_id, event_id)
  REFERENCES public.event_result_closure_log(id, closure_id, company_id, event_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- Projecção protegida, nunca um campo mutável da revisão. PK = uma activa por evento.
-- A remoção futura desta ligação exige recibo e conserva revisão/log/selos (Q3).
CREATE TABLE public.event_result_closure_active (
  event_id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  closure_id uuid NOT NULL UNIQUE,
  activation_receipt_id uuid NOT NULL UNIQUE,
  FOREIGN KEY (closure_id, company_id, event_id)
    REFERENCES public.event_result_closures(id, company_id, event_id) ON DELETE RESTRICT,
  FOREIGN KEY (activation_receipt_id, closure_id, company_id, event_id)
    REFERENCES public.event_result_closure_log(id, closure_id, company_id, event_id) ON DELETE RESTRICT
);
CREATE INDEX result_closure_active_company_idx ON public.event_result_closure_active(company_id, event_id);

-- Bloqueio fechado nesta B1, incluindo o owner: não existe ainda caminho legítimo de escrita.
CREATE FUNCTION issue644b_private.writer_not_installed() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $fn$
BEGIN
  RAISE EXCEPTION 'result_closure_writer_not_installed' USING ERRCODE = '42501';
END $fn$;
CREATE FUNCTION issue644b_private.append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $fn$
BEGIN
  RAISE EXCEPTION 'result_closure_history_immutable' USING ERRCODE = '42501';
END $fn$;

-- Apenas valida referências/metadados; não resolve modo nem calcula resultados financeiros.
CREATE FUNCTION issue644b_private.validate_closure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_field text;
  v_required text[] := ARRAY['criterion_version','criterion_sha256','closed_by','budget_mode_resolved',
    'budget_mode_source','expense_source','expense_source_original','cost_include_overhead','partner_calc_basis',
    'result_revenue_vat_basis','result_expense_vat_basis','revenue_policy','revenue_policy_version',
    'revenue_include_overhead','result_origin'];
  v_nulls text[];
  v_previous public.event_result_closures%ROWTYPE;
BEGIN
  -- Ordem determinística; B3 deverá adquirir locks de escrita antes de derivar a base.
  PERFORM 1 FROM public.events WHERE id IN (NEW.event_id, NEW.closure_root_event_id) ORDER BY id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM public.events e JOIN public.events r ON r.id = NEW.closure_root_event_id
    WHERE e.id = NEW.event_id AND e.company_id = NEW.company_id AND r.company_id = NEW.company_id
      AND r.parent_event_id IS NULL AND (e.id = r.id OR e.parent_event_id = r.id)) THEN
    RAISE EXCEPTION 'result_closure_event_company_or_family_mismatch' USING ERRCODE = '23503';
  END IF;
  IF NEW.final_bp_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bp_versions b
    JOIN public.events e ON e.id = b.event_id WHERE b.id = NEW.final_bp_version_id
      AND b.event_id = NEW.event_id AND e.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'result_closure_bp_mismatch' USING ERRCODE = '23503';
  END IF;
  IF NEW.previous_closure_id IS NOT NULL THEN
    SELECT * INTO v_previous FROM public.event_result_closures WHERE id = NEW.previous_closure_id;
    IF NOT FOUND OR v_previous.event_id <> NEW.event_id OR v_previous.company_id <> NEW.company_id
      OR v_previous.revision >= NEW.revision THEN
      RAISE EXCEPTION 'result_closure_previous_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  SELECT coalesce(array_agg(f ORDER BY f), ARRAY[]::text[]) INTO v_nulls
    FROM unnest(v_required) f WHERE to_jsonb(NEW)->f = 'null'::jsonb;
  IF (SELECT coalesce(array_agg(f ORDER BY f), ARRAY[]::text[]) FROM unnest(NEW.unknown_fields) f)
      IS DISTINCT FROM v_nulls THEN
    RAISE EXCEPTION 'result_closure_unknown_fields_mismatch' USING ERRCODE = '23514';
  END IF;
  FOREACH v_field IN ARRAY v_required LOOP
    IF NOT v_field = ANY(NEW.unknown_fields) AND
      (jsonb_typeof(NEW.field_evidence->v_field) IS DISTINCT FROM 'object'
        OR NEW.field_evidence->v_field = '{}'::jsonb) THEN
      RAISE EXCEPTION 'result_closure_field_evidence_missing: %', v_field USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $fn$;

CREATE FUNCTION issue644b_private.validate_seal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.event_settlements s WHERE s.id = NEW.settlement_id
    AND s.company_id = NEW.company_id AND s.event_id = NEW.event_id) THEN
    RAISE EXCEPTION 'result_closure_seal_mismatch' USING ERRCODE = '23503';
  END IF;
  IF NEW.bp_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bp_versions b
    JOIN public.events e ON e.id = b.event_id WHERE b.id = NEW.bp_version_id
      AND b.event_id = NEW.event_id AND e.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'result_closure_seal_bp_mismatch' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $fn$;

-- Coerência diferida: a revisão, os selos e o recibo nascem juntos na futura transacção B3.
CREATE FUNCTION issue644b_private.validate_receipts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE v_closure public.event_result_closures%ROWTYPE; v_id uuid;
BEGIN
  v_id := CASE WHEN TG_TABLE_NAME = 'event_result_closures' THEN (to_jsonb(NEW)->>'id')::uuid
    ELSE (to_jsonb(NEW)->>'closure_id')::uuid END;
  SELECT * INTO STRICT v_closure FROM public.event_result_closures WHERE id = v_id;
  IF NOT EXISTS (SELECT 1 FROM public.event_result_closures r WHERE r.id = v_closure.root_closure_id
    AND r.closed_by IS NOT DISTINCT FROM v_closure.closed_by AND r.capture_kind = v_closure.capture_kind) THEN
    RAISE EXCEPTION 'result_closure_operation_mismatch' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.event_result_closure_log l WHERE l.closure_id = v_id
    AND l.company_id = v_closure.company_id AND l.event_id = v_closure.event_id
    AND l.action = CASE WHEN v_closure.capture_kind = 'close_event' THEN 'closed' ELSE 'reconstructed' END
    AND l.performed_by = v_closure.captured_by AND l.occurred_at >= v_closure.closed_at) THEN
    RAISE EXCEPTION 'result_closure_initial_receipt_missing' USING ERRCODE = '23514';
  END IF;
  IF (v_closure.result_origin = 'seal_snapshot') IS TRUE AND NOT EXISTS
    (SELECT 1 FROM public.event_result_closure_seals WHERE closure_id = v_id) THEN
    RAISE EXCEPTION 'result_closure_seal_reference_missing' USING ERRCODE = '23514';
  END IF;
  IF v_closure.result_origin IS DISTINCT FROM 'seal_snapshot' AND EXISTS
    (SELECT 1 FROM public.event_result_closure_seals WHERE closure_id = v_id) THEN
    RAISE EXCEPTION 'result_closure_origin_mismatch' USING ERRCODE = '23514';
  END IF;
  IF v_closure.confirmation_receipt_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM public.event_result_closure_log l WHERE l.id = v_closure.confirmation_receipt_id
      AND l.action = 'confirmed' AND l.replacement_closure_id = v_closure.id
      AND l.performed_by = v_closure.captured_by AND l.occurred_at = v_closure.captured_at) THEN
    RAISE EXCEPTION 'result_closure_confirmation_mismatch' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_result_closure_active a WHERE a.closure_id = v_id) AND EXISTS
    (SELECT 1 FROM public.event_result_closure_log l WHERE l.closure_id = v_id
      AND l.action IN ('reopened','legacy_reopened','confirmed')) THEN
    RAISE EXCEPTION 'result_closure_invalidated_still_active' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $fn$;
CREATE FUNCTION issue644b_private.validate_active() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.event_result_closure_log l
    WHERE l.id = NEW.activation_receipt_id AND l.closure_id = NEW.closure_id
      AND l.action IN ('closed','reconstructed')) OR EXISTS
    (SELECT 1 FROM public.event_result_closure_log l WHERE l.closure_id = NEW.closure_id
      AND l.action IN ('reopened','legacy_reopened','confirmed')) THEN
    RAISE EXCEPTION 'result_closure_active_receipt_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE FUNCTION issue644b_private.validate_deactivation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF (TG_OP = 'DELETE' OR OLD.closure_id IS DISTINCT FROM NEW.closure_id) AND NOT EXISTS
    (SELECT 1 FROM public.event_result_closure_log l WHERE l.closure_id = OLD.closure_id
      AND l.company_id = OLD.company_id AND l.event_id = OLD.event_id
      AND l.action IN ('reopened','legacy_reopened','confirmed')) THEN
    RAISE EXCEPTION 'result_closure_deactivation_receipt_missing' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $fn$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA issue644b_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER a_result_closure_writer BEFORE INSERT ON public.event_result_closures
  FOR EACH ROW EXECUTE FUNCTION issue644b_private.writer_not_installed();
CREATE TRIGGER result_closure_immutable BEFORE UPDATE OR DELETE ON public.event_result_closures
  FOR EACH ROW EXECUTE FUNCTION issue644b_private.append_only();
CREATE TRIGGER result_closure_no_truncate BEFORE TRUNCATE ON public.event_result_closures
  FOR EACH STATEMENT EXECUTE FUNCTION issue644b_private.append_only();
CREATE TRIGGER result_closure_validate BEFORE INSERT ON public.event_result_closures
  FOR EACH ROW EXECUTE FUNCTION issue644b_private.validate_closure();
CREATE CONSTRAINT TRIGGER result_closure_receipts AFTER INSERT ON public.event_result_closures
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION issue644b_private.validate_receipts();
CREATE TRIGGER a_result_closure_seal_writer BEFORE INSERT ON public.event_result_closure_seals
  FOR EACH ROW EXECUTE FUNCTION issue644b_private.writer_not_installed();
CREATE TRIGGER result_closure_seal_immutable BEFORE UPDATE OR DELETE ON public.event_result_closure_seals
  FOR EACH ROW EXECUTE FUNCTION issue644b_private.append_only();
CREATE TRIGGER result_closure_seal_no_truncate BEFORE TRUNCATE ON public.event_result_closure_seals
  FOR EACH STATEMENT EXECUTE FUNCTION issue644b_private.append_only();
CREATE TRIGGER result_closure_seal_validate BEFORE INSERT ON public.event_result_closure_seals
  FOR EACH ROW EXECUTE FUNCTION issue644b_private.validate_seal();
CREATE CONSTRAINT TRIGGER result_closure_seal_receipts AFTER INSERT ON public.event_result_closure_seals
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION issue644b_private.validate_receipts();
CREATE TRIGGER a_result_closure_log_writer BEFORE INSERT ON public.event_result_closure_log
  FOR EACH ROW EXECUTE FUNCTION issue644b_private.writer_not_installed();
CREATE TRIGGER result_closure_log_immutable BEFORE UPDATE OR DELETE ON public.event_result_closure_log
  FOR EACH ROW EXECUTE FUNCTION issue644b_private.append_only();
CREATE TRIGGER result_closure_log_no_truncate BEFORE TRUNCATE ON public.event_result_closure_log
  FOR EACH STATEMENT EXECUTE FUNCTION issue644b_private.append_only();
CREATE CONSTRAINT TRIGGER result_closure_log_receipts AFTER INSERT ON public.event_result_closure_log
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION issue644b_private.validate_receipts();
CREATE TRIGGER a_result_closure_active_writer BEFORE INSERT OR UPDATE OR DELETE ON public.event_result_closure_active
  FOR EACH ROW EXECUTE FUNCTION issue644b_private.writer_not_installed();
CREATE TRIGGER result_closure_active_no_truncate BEFORE TRUNCATE ON public.event_result_closure_active
  FOR EACH STATEMENT EXECUTE FUNCTION issue644b_private.append_only();
CREATE TRIGGER result_closure_active_validate BEFORE INSERT OR UPDATE ON public.event_result_closure_active
  FOR EACH ROW EXECUTE FUNCTION issue644b_private.validate_active();
CREATE CONSTRAINT TRIGGER result_closure_active_deactivation AFTER UPDATE OR DELETE ON public.event_result_closure_active
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION issue644b_private.validate_deactivation();

ALTER TABLE public.event_result_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_result_closure_seals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_result_closure_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_result_closure_active ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_result_closures, public.event_result_closure_seals,
  public.event_result_closure_log, public.event_result_closure_active FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.event_result_closures, public.event_result_closure_seals,
  public.event_result_closure_log, public.event_result_closure_active TO authenticated, service_role;
-- service_role sem BYPASSRLS também pode ler; empresa/acesso do destinatário é gate da edge.
-- BYPASSRLS não concede DML: ACL e bloqueios continuam fechados.
CREATE POLICY result_closure_backend ON public.event_result_closures FOR SELECT TO service_role USING (true);
CREATE POLICY result_closure_seal_backend ON public.event_result_closure_seals FOR SELECT TO service_role USING (true);
CREATE POLICY result_closure_log_backend ON public.event_result_closure_log FOR SELECT TO service_role USING (true);
CREATE POLICY result_closure_active_backend ON public.event_result_closure_active FOR SELECT TO service_role USING (true);

-- Igualdade explícita: isolamento também antes da promoção dos helpers preparados 0313/0326.
-- Gates staff dos consumidores: o direito ao evento basta, sem exigir Posição Financeira.
-- Partner sem papel staff não lê a base integral: só a projecção autorizada da edge (B11).
CREATE POLICY result_closure_company ON public.event_result_closures AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.row_belongs_to_current_company(company_id))
  WITH CHECK (company_id = public.current_company_id() AND public.row_belongs_to_current_company(company_id));
CREATE POLICY result_closure_read ON public.event_result_closures FOR SELECT TO authenticated USING (
  public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role) OR
  (NOT public.has_role(auth.uid(), 'partner'::public.app_role) AND
    (public.has_permission(auth.uid(), 'view_events') OR public.has_permission(auth.uid(), 'view_bp')
      OR public.has_permission(auth.uid(), 'view_report_dre') OR public.has_permission(auth.uid(), 'view_financial_position'))));
-- Tabelas dependentes seguem exactamente a autorização da revisão, incluindo RLS.
CREATE POLICY result_closure_seal_company ON public.event_result_closure_seals AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.row_belongs_to_current_company(company_id))
  WITH CHECK (company_id = public.current_company_id() AND public.row_belongs_to_current_company(company_id));
CREATE POLICY result_closure_seal_read ON public.event_result_closure_seals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_result_closures c WHERE c.id = closure_id));
CREATE POLICY result_closure_log_company ON public.event_result_closure_log AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.row_belongs_to_current_company(company_id))
  WITH CHECK (company_id = public.current_company_id() AND public.row_belongs_to_current_company(company_id));
CREATE POLICY result_closure_log_read ON public.event_result_closure_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_result_closures c WHERE c.id = closure_id));
CREATE POLICY result_closure_active_company ON public.event_result_closure_active AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.row_belongs_to_current_company(company_id))
  WITH CHECK (company_id = public.current_company_id() AND public.row_belongs_to_current_company(company_id));
CREATE POLICY result_closure_active_read ON public.event_result_closure_active FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_result_closures c WHERE c.id = closure_id));

-- Rollback: supabase/manual/rollback_0344_issue644b_result_basis_comentado.sql.
-- B3: fechar/abrir/confirmar sob locks + recibos; validar fontes/contratos e autores no servidor.
-- Não activar escrita/consumidores enquanto esse comando e os leitores não forem promovidos.
