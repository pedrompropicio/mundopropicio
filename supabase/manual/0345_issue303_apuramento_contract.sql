-- PREPARADA, NÃO APLICADA — #303 E2b/R2, autorização 6666841381, reserva 6673065211.
-- Base: main e2ef2d0; plano §§2.0–2.3/4.1; Q1–Q6 6669982231, SaaS 6670199047.
-- Só estrutura/guardas: sem seed, comandos, movimentos, activação ou acesso a storage.
-- R3 substituirá a guarda fechada por comandos privados; R4 provará corte/cadeia.
-- Aplicação futura exige revisão de catálogo/ACL (0077/0090/0213/0317/0323).
BEGIN;

-- Serializar a pré-condição com os índices; nunca escolher/corrigir dados históricos.
LOCK TABLE public.ticket_office_statements, public.ticket_office_statement_lines,
  public.company_features IN SHARE ROW EXCLUSIVE MODE;
DO $preconditions$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ticket_office_statement_lines
             GROUP BY statement_id, position HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM public.ticket_office_statement_lines
                WHERE previous_statement_id IS NOT NULL
                GROUP BY previous_statement_id HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM public.ticket_office_statement_lines l
                JOIN public.ticket_office_statements s ON s.id = l.statement_id
                WHERE s.status = 'confirmed' AND l.line_type = 'event_right' AND l.event_id IS NOT NULL
                GROUP BY l.event_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'issue303_historical_uniqueness_conflict' USING ERRCODE = '23505';
  END IF;
  -- Uma flag prévia não é autorização para activar este contrato incompleto.
  IF EXISTS (SELECT 1 FROM public.company_features
             WHERE feature_key = 'ticket-office-statements-v2') THEN
    RAISE EXCEPTION 'issue303_existing_configuration_requires_review' USING ERRCODE = '23514';
  END IF;
END $preconditions$;

-- Validação de catálogo por trigger privado: um CHECK que chamasse um helper
-- revogado impediria até INSERTs v1 por authenticated durante o planeamento.
CREATE FUNCTION public._issue303_header_timezone_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.position_timezone IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.position_timezone) THEN
    RAISE EXCEPTION 'issue303_invalid_timezone' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public._issue303_header_timezone_guard() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.ticket_office_statements
  ADD COLUMN contract_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN period_from date,
  ADD COLUMN period_to date,
  ADD COLUMN position_cutoff_at timestamptz,
  ADD COLUMN position_timezone text,
  ADD COLUMN position_cutoff_source text,
  ADD COLUMN predecessor_statement_id uuid REFERENCES public.ticket_office_statements(id),
  ADD COLUMN primary_document_id uuid REFERENCES public.ticket_office_statement_documents(id),
  ADD COLUMN primary_document_sha256 text,
  ADD COLUMN revision bigint NOT NULL DEFAULT 1,
  ADD COLUMN confirmation_receipt jsonb,
  -- Claim persistente preenchido atomicamente por R3; não desaparece ao desligar a flag.
  ADD COLUMN opening_balance_line_id uuid REFERENCES public.ticket_office_statement_lines(id),
  ADD CONSTRAINT issue303_version CHECK (contract_version IN (1, 2)),
  ADD CONSTRAINT issue303_period CHECK (
    (period_from IS NULL AND period_to IS NULL) OR
    (period_from IS NOT NULL AND period_to IS NOT NULL AND period_from <= period_to)),
  ADD CONSTRAINT issue303_cutoff CHECK (
    (position_cutoff_at IS NULL AND position_timezone IS NULL AND position_cutoff_source IS NULL) OR
    (position_cutoff_at IS NOT NULL AND isfinite(position_cutoff_at) AND position_timezone IS NOT NULL
     AND length(btrim(position_timezone)) > 0
     AND position_cutoff_source IS NOT NULL AND position_cutoff_source IN ('company_day_end', 'pdf_explicit'))),
  ADD CONSTRAINT issue303_predecessor CHECK (predecessor_statement_id IS DISTINCT FROM id),
  ADD CONSTRAINT issue303_pdf CHECK (
    (primary_document_id IS NULL AND primary_document_sha256 IS NULL) OR
    (primary_document_id IS NOT NULL AND primary_document_sha256 IS NOT NULL
     AND primary_document_sha256 ~ '^[0-9a-f]{64}$')),
  ADD CONSTRAINT issue303_revision CHECK (revision > 0),
  ADD CONSTRAINT issue303_total_finite CHECK (document_total IS NULL OR document_total::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  ADD CONSTRAINT issue303_receipt CHECK (confirmation_receipt IS NULL OR
    (jsonb_typeof(confirmation_receipt) = 'object'
     AND confirmation_receipt @> '{"contract_version":2}'::jsonb
     AND confirmation_receipt ?& ARRAY['revision','calculated_total','independent_position','sources','confirmed_by','confirmed_at']
     AND confirmation_receipt->'revision' = to_jsonb(revision)
     AND jsonb_typeof(confirmation_receipt->'calculated_total') = 'number'
     AND jsonb_typeof(confirmation_receipt->'independent_position') = 'number'
     AND jsonb_typeof(confirmation_receipt->'sources') = 'array'
     AND jsonb_typeof(confirmation_receipt->'confirmed_by') = 'string'
     AND jsonb_typeof(confirmation_receipt->'confirmed_at') = 'string')),
  ADD CONSTRAINT issue303_confirmed CHECK (contract_version <> 2 OR status <> 'confirmed' OR
    (document_total IS NOT NULL AND primary_document_id IS NOT NULL AND primary_document_sha256 IS NOT NULL
     AND position_cutoff_at IS NOT NULL AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL
     AND confirmation_receipt IS NOT NULL
     AND confirmation_receipt->>'confirmed_by' = confirmed_by::text
     AND (confirmation_receipt->>'confirmed_at')::timestamptz = confirmed_at
     AND confirmation_receipt->'calculated_total' = to_jsonb(document_total)
     AND confirmation_receipt->'independent_position' = to_jsonb(document_total))),
  ADD CONSTRAINT issue303_opening_claim CHECK (opening_balance_line_id IS NULL OR
    (contract_version = 2 AND status = 'confirmed' AND predecessor_statement_id IS NULL));

CREATE TRIGGER issue303_header_timezone_guard BEFORE INSERT OR UPDATE ON public.ticket_office_statements
  FOR EACH ROW EXECUTE FUNCTION public._issue303_header_timezone_guard();

CREATE UNIQUE INDEX issue303_successor_once ON public.ticket_office_statements(predecessor_statement_id)
  WHERE predecessor_statement_id IS NOT NULL;
CREATE UNIQUE INDEX issue303_opening_account_once ON public.ticket_office_statements(financial_account_id)
  WHERE opening_balance_line_id IS NOT NULL;

ALTER TABLE public.ticket_office_statement_lines
  ADD COLUMN document_line_type text,
  ADD COLUMN document_page integer,
  ADD COLUMN document_line_ref text,
  ADD COLUMN source_sha256 text,
  ADD COLUMN declared_event_net numeric(14,2),
  ADD COLUMN event_gross_amount numeric(14,2),
  ADD COLUMN event_retained_amount numeric(14,2),
  ADD COLUMN quota_line_id uuid REFERENCES public.ticket_office_statement_lines(id),
  ADD COLUMN opening_note text,
  ADD COLUMN opening_created_by uuid,
  ADD COLUMN opening_created_at timestamptz,
  ADD COLUMN adjusts_statement_id uuid REFERENCES public.ticket_office_statements(id),
  ADD COLUMN adjusts_line_id uuid REFERENCES public.ticket_office_statement_lines(id),
  ADD COLUMN adjustment_reason text,
  ADD COLUMN positive_sign_evidence text,
  ADD CONSTRAINT issue303_document_type CHECK (document_line_type IN
    ('event_sales','ticketline_invoice','venue_settlement','advance','carry_over','opening_balance')),
  ADD CONSTRAINT issue303_line_position CHECK (position >= 0),
  ADD CONSTRAINT issue303_line_page CHECK (document_page IS NULL OR document_page > 0),
  ADD CONSTRAINT issue303_line_ref CHECK (document_line_ref IS NULL OR length(btrim(document_line_ref)) > 0),
  ADD CONSTRAINT issue303_source_hash CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT issue303_line_finite CHECK (amount IS NULL OR amount::text NOT IN ('NaN','Infinity','-Infinity')),
  -- O CHECK antigo de line_type permanece intacto. NULL canónico conserva v1.
  ADD CONSTRAINT issue303_type_envelope CHECK (document_line_type IS NULL OR line_type = CASE document_line_type
    WHEN 'event_sales' THEN 'event_right' WHEN 'opening_balance' THEN 'carry_over' ELSE document_line_type END),
  ADD CONSTRAINT issue303_quota_self CHECK (quota_line_id IS DISTINCT FROM id),
  ADD CONSTRAINT issue303_adjusts_self CHECK (adjusts_line_id IS DISTINCT FROM id AND adjusts_statement_id IS DISTINCT FROM statement_id),
  ADD CONSTRAINT issue303_adjustment CHECK (
    (adjusts_statement_id IS NULL AND adjusts_line_id IS NULL AND adjustment_reason IS NULL) OR
    (document_line_type IS NOT NULL AND document_line_type IN ('ticketline_invoice','venue_settlement')
     AND adjusts_statement_id IS NOT NULL AND adjusts_line_id IS NOT NULL
     AND adjustment_reason IS NOT NULL AND length(btrim(adjustment_reason)) > 0 AND quota_line_id IS NULL)),
  ADD CONSTRAINT issue303_sales_fields CHECK (
    (document_line_type = 'event_sales' AND event_id IS NOT NULL AND declared_event_net IS NOT NULL
     AND event_gross_amount IS NOT NULL AND event_retained_amount IS NOT NULL
     AND declared_event_net::text NOT IN ('NaN','Infinity','-Infinity')
     AND event_gross_amount::text NOT IN ('NaN','Infinity','-Infinity')
     AND event_retained_amount::text NOT IN ('NaN','Infinity','-Infinity')
     AND event_gross_amount >= 0 AND event_retained_amount >= 0 AND event_retained_amount <= event_gross_amount
     AND (amount = event_gross_amount - event_retained_amount OR (amount IS NULL AND pending_document))
     AND quota_line_id IS NULL AND transaction_id IS NULL AND invoice_group_id IS NULL AND previous_statement_id IS NULL) OR
    (document_line_type IS DISTINCT FROM 'event_sales' AND declared_event_net IS NULL
     AND event_gross_amount IS NULL AND event_retained_amount IS NULL)),
  ADD CONSTRAINT issue303_invoice_fields CHECK (document_line_type IS NULL OR document_line_type NOT IN ('ticketline_invoice','venue_settlement') OR
    (previous_statement_id IS NULL AND ticket_office_settlement_id IS NULL
     AND NOT (transaction_id IS NOT NULL AND invoice_group_id IS NOT NULL)
     AND (document_line_type <> 'ticketline_invoice' OR (transaction_id IS NOT NULL OR invoice_group_id IS NOT NULL))
     AND (quota_line_id IS NULL OR event_id IS NOT NULL)
     AND (amount IS NULL OR amount <= 0 OR (positive_sign_evidence IS NOT NULL AND length(btrim(positive_sign_evidence)) > 0))
     AND (document_line_type <> 'venue_settlement' OR transaction_id IS NOT NULL OR invoice_group_id IS NOT NULL
          OR (source_sha256 IS NOT NULL AND notes IS NOT NULL AND length(btrim(notes)) > 0)))),
  ADD CONSTRAINT issue303_advance_fields CHECK (document_line_type IS DISTINCT FROM 'advance' OR
    ((amount < 0 OR (amount IS NULL AND pending_document)) AND transaction_id IS NOT NULL
     AND event_id IS NULL AND ticket_office_settlement_id IS NULL AND quota_line_id IS NULL
     AND invoice_group_id IS NULL AND previous_statement_id IS NULL)),
  ADD CONSTRAINT issue303_carry_fields CHECK (document_line_type IS DISTINCT FROM 'carry_over' OR
    (previous_statement_id IS NOT NULL AND event_id IS NULL AND ticket_office_settlement_id IS NULL
     AND transaction_id IS NULL AND invoice_group_id IS NULL AND quota_line_id IS NULL)),
  ADD CONSTRAINT issue303_opening_fields CHECK (
    (document_line_type = 'opening_balance' AND opening_note IS NOT NULL AND length(btrim(opening_note)) > 0
     AND opening_created_by IS NOT NULL AND opening_created_at IS NOT NULL AND isfinite(opening_created_at)
     AND event_id IS NULL AND ticket_office_settlement_id IS NULL AND transaction_id IS NULL
     AND invoice_group_id IS NULL AND quota_line_id IS NULL AND previous_statement_id IS NULL) OR
    (document_line_type IS DISTINCT FROM 'opening_balance' AND opening_note IS NULL
     AND opening_created_by IS NULL AND opening_created_at IS NULL));

CREATE UNIQUE INDEX issue303_line_position_once ON public.ticket_office_statement_lines(statement_id, position);
CREATE UNIQUE INDEX issue303_line_ref_once ON public.ticket_office_statement_lines(statement_id, document_line_ref)
  WHERE document_line_ref IS NOT NULL;
CREATE UNIQUE INDEX issue303_event_proposal_once ON public.ticket_office_statement_lines(statement_id, event_id)
  WHERE document_line_type = 'event_sales';
CREATE UNIQUE INDEX issue303_carry_once ON public.ticket_office_statement_lines(previous_statement_id)
  WHERE previous_statement_id IS NOT NULL;
CREATE UNIQUE INDEX issue303_opening_document_once ON public.ticket_office_statement_lines(statement_id)
  WHERE document_line_type = 'opening_balance';

CREATE TABLE public.ticket_office_statement_events (
  event_id uuid PRIMARY KEY REFERENCES public.events(id),
  statement_id uuid NOT NULL REFERENCES public.ticket_office_statements(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  financial_account_id uuid NOT NULL REFERENCES public.financial_accounts(id),
  quota_line_id uuid NOT NULL UNIQUE REFERENCES public.ticket_office_statement_lines(id),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX issue303_membership_statement ON public.ticket_office_statement_events(statement_id);
-- Sem backfill: pertenças v1 exigem prova documental na janela, antes da activação.

CREATE TABLE public.ticket_office_statement_config_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  financial_account_id uuid NOT NULL REFERENCES public.financial_accounts(id),
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  old_config jsonb,
  new_config jsonb,
  old_feature_enabled boolean,
  new_feature_enabled boolean,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX issue303_config_account_log ON public.ticket_office_statement_config_log(financial_account_id, changed_at);

CREATE FUNCTION public._issue303_validate_config(p_company uuid, p_config jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE a jsonb; ids uuid[] := '{}'; account_id uuid;
BEGIN
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' OR NOT (p_config ? 'accounts')
     OR jsonb_typeof(p_config->'accounts') <> 'array' THEN RETURN false; END IF;
  FOR a IN SELECT value FROM jsonb_array_elements(p_config->'accounts') LOOP
    IF jsonb_typeof(a) <> 'object' OR NOT (a ?& ARRAY['financial_account_id','enabled','contract_version'])
       OR jsonb_typeof(a->'financial_account_id') <> 'string'
       OR jsonb_typeof(a->'enabled') <> 'boolean' OR a->'contract_version' <> '2'::jsonb THEN RETURN false; END IF;
    account_id := (a->>'financial_account_id')::uuid;
    IF account_id = ANY(ids) OR NOT EXISTS (SELECT 1 FROM public.financial_accounts
        WHERE id = account_id AND company_id = p_company AND type = 'ticket_office') THEN RETURN false; END IF;
    ids := array_append(ids, account_id);
  END LOOP;
  RETURN true;
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END $$;

CREATE FUNCTION public._issue303_account_enabled(p_company uuid, p_account uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_features f
    WHERE f.company_id = p_company AND f.feature_key = 'ticket-office-statements-v2' AND f.enabled
      AND public._issue303_validate_config(f.company_id, f.config)
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(f.config->'accounts') = 'array'
                    THEN f.config->'accounts' ELSE '[]'::jsonb END) a
                  WHERE a->>'financial_account_id' = p_account::text AND a->'enabled' = 'true'::jsonb))
$$;

CREATE FUNCTION public._issue303_config_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE c uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.feature_key = 'ticket-office-statements-v2' OR NEW.feature_key = 'ticket-office-statements-v2')
     AND (NEW.feature_key IS DISTINCT FROM OLD.feature_key OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
    RAISE EXCEPTION 'issue303_configuration_identity_immutable' USING ERRCODE = '42501';
  END IF;
  IF (TG_OP = 'DELETE' AND OLD.feature_key <> 'ticket-office-statements-v2') OR
     (TG_OP <> 'DELETE' AND NEW.feature_key <> 'ticket-office-statements-v2') THEN RETURN coalesce(NEW, OLD); END IF;
  c := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;
  -- has_role pode incluir platform_admin implicitamente; exigir o papel literal.
  IF auth.uid() IS NULL OR c IS DISTINCT FROM public.current_company_id()
     OR NOT EXISTS (SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid() AND company_id = c AND role = 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'issue303_configuration_requires_company_admin' USING ERRCODE = '42501';
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF NOT public._issue303_validate_config(c, NEW.config) THEN
      RAISE EXCEPTION 'issue303_invalid_account_configuration' USING ERRCODE = '23514';
    END IF;
    -- company_features tem default histórico true: só esta chave nasce sempre desligada.
    IF TG_OP = 'INSERT' THEN NEW.enabled := false; END IF;
    NEW.enabled_by := auth.uid(); NEW.enabled_at := now(); NEW.updated_at := now();
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;

CREATE FUNCTION public._issue303_config_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE old_accounts jsonb := '[]'; new_accounts jsonb := '[]'; c uuid;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.feature_key <> 'ticket-office-statements-v2') OR
     (TG_OP <> 'DELETE' AND NEW.feature_key <> 'ticket-office-statements-v2') THEN RETURN NULL; END IF;
  c := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;
  IF TG_OP <> 'INSERT' THEN old_accounts := OLD.config->'accounts'; END IF;
  IF TG_OP <> 'DELETE' THEN new_accounts := NEW.config->'accounts'; END IF;
  INSERT INTO public.ticket_office_statement_config_log
    (company_id, financial_account_id, operation, old_config, new_config, old_feature_enabled, new_feature_enabled, changed_by)
  SELECT c, coalesce(o.a->>'financial_account_id', n.a->>'financial_account_id')::uuid, TG_OP, o.a, n.a,
         CASE WHEN TG_OP <> 'INSERT' THEN OLD.enabled END,
         CASE WHEN TG_OP <> 'DELETE' THEN NEW.enabled END, auth.uid()
    FROM jsonb_array_elements(old_accounts) o(a)
    FULL JOIN jsonb_array_elements(new_accounts) n(a) ON o.a->>'financial_account_id' = n.a->>'financial_account_id'
   WHERE o.a IS DISTINCT FROM n.a OR TG_OP <> 'UPDATE' OR OLD.enabled IS DISTINCT FROM NEW.enabled;
  RETURN NULL;
END $$;
CREATE TRIGGER issue303_config_guard BEFORE INSERT OR UPDATE OR DELETE ON public.company_features
  FOR EACH ROW EXECUTE FUNCTION public._issue303_config_guard();
CREATE TRIGGER issue303_config_audit AFTER INSERT OR UPDATE OR DELETE ON public.company_features
  FOR EACH ROW EXECUTE FUNCTION public._issue303_config_audit();

-- Guarda fechada R2, também contra RPCs legadas SECURITY DEFINER/service_role.
-- Sem GUC, papel ou payload que abra uma escrita v2. R3 terá autorização privada própria.
CREATE FUNCTION public._issue303_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE p record; ids uuid[] := '{}';
BEGIN
  IF TG_TABLE_NAME = 'ticket_office_statements' THEN
    IF TG_OP <> 'INSERT' THEN
      IF OLD.contract_version = 2 OR public._issue303_account_enabled(OLD.company_id, OLD.financial_account_id) THEN
        RAISE EXCEPTION 'issue303_v2_commands_not_installed' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      IF NOT EXISTS (SELECT 1 FROM public.financial_accounts
          WHERE id = NEW.financial_account_id AND company_id = NEW.company_id) THEN
        RAISE EXCEPTION 'issue303_account_company_mismatch' USING ERRCODE = '42501';
      END IF;
      IF NEW.contract_version = 2 OR public._issue303_account_enabled(NEW.company_id, NEW.financial_account_id) THEN
        RAISE EXCEPTION 'issue303_v2_commands_not_installed' USING ERRCODE = '42501';
      END IF;
      IF NEW.predecessor_statement_id IS NOT NULL OR NEW.primary_document_id IS NOT NULL
         OR NEW.confirmation_receipt IS NOT NULL OR NEW.opening_balance_line_id IS NOT NULL
         OR NEW.position_cutoff_at IS NOT NULL OR NEW.revision <> 1 THEN
        RAISE EXCEPTION 'issue303_v2_requires_v2_parent_and_command' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME IN ('ticket_office_statement_lines','ticket_office_statement_documents') THEN
    IF TG_OP <> 'INSERT' THEN ids := array_append(ids, OLD.statement_id); END IF;
    IF TG_OP <> 'DELETE' THEN ids := array_append(ids, NEW.statement_id); END IF;
    -- Locks OLD/NEW antes de ler estado; compatível com o protocolo 0213.
    FOR p IN SELECT * FROM public.ticket_office_statements WHERE id = ANY(ids) ORDER BY id FOR UPDATE LOOP
      IF p.contract_version = 2 OR public._issue303_account_enabled(p.company_id, p.financial_account_id) THEN
        RAISE EXCEPTION 'issue303_v2_commands_not_installed' USING ERRCODE = '42501';
      END IF;
    END LOOP;
    IF TG_TABLE_NAME = 'ticket_office_statement_lines' AND TG_OP <> 'DELETE' THEN
      IF NEW.document_line_type IS NOT NULL THEN
        RAISE EXCEPTION 'issue303_v2_requires_v2_parent_and_command' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'issue303_v2_commands_not_installed' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
CREATE TRIGGER issue303_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.ticket_office_statements
  FOR EACH ROW EXECUTE FUNCTION public._issue303_write_guard();
CREATE TRIGGER issue303_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.ticket_office_statement_lines
  FOR EACH ROW EXECUTE FUNCTION public._issue303_write_guard();
CREATE TRIGGER issue303_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.ticket_office_statement_documents
  FOR EACH ROW EXECUTE FUNCTION public._issue303_write_guard();
CREATE TRIGGER issue303_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.ticket_office_statement_events
  FOR EACH ROW EXECUTE FUNCTION public._issue303_write_guard();
CREATE TRIGGER issue303_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.ticket_office_statement_config_log
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION public._issue303_write_guard();

REVOKE ALL ON FUNCTION public._issue303_validate_config(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._issue303_account_enabled(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._issue303_config_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._issue303_config_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._issue303_write_guard() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.ticket_office_statement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_office_statement_config_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_office_statements, public.ticket_office_statement_lines,
  public.ticket_office_statement_documents, public.ticket_office_statement_events,
  public.ticket_office_statement_config_log, public.company_features FROM PUBLIC, anon;
REVOKE ALL ON public.ticket_office_statement_events, public.ticket_office_statement_config_log FROM authenticated, service_role;
GRANT SELECT ON public.ticket_office_statement_events, public.ticket_office_statement_config_log TO authenticated;

-- Políticas RESTRICTIVE adicionais não podem ser neutralizadas pelo OR das antigas.
CREATE POLICY issue303_company ON public.ticket_office_statements AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY issue303_company ON public.ticket_office_statement_lines AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY issue303_company ON public.ticket_office_statement_documents AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY issue303_company ON public.ticket_office_statement_events AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY issue303_read ON public.ticket_office_statement_events FOR SELECT TO authenticated USING (true);
CREATE POLICY issue303_company ON public.ticket_office_statement_config_log AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY issue303_read ON public.ticket_office_statement_config_log FOR SELECT TO authenticated USING (true);
CREATE POLICY issue303_feature_company ON public.company_features AS RESTRICTIVE FOR ALL TO authenticated
  USING (feature_key <> 'ticket-office-statements-v2' OR company_id = public.current_company_id())
  WITH CHECK (feature_key <> 'ticket-office-statements-v2' OR company_id = public.current_company_id());
-- A política histórica só admite platform_admin. Esta chave exige admin da
-- empresa; as outras chaves conservam exactamente essa política histórica.
CREATE POLICY issue303_feature_insert ON public.company_features FOR INSERT TO authenticated
  WITH CHECK (feature_key = 'ticket-office-statements-v2' AND company_id = public.current_company_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY issue303_feature_update ON public.company_features FOR UPDATE TO authenticated
  USING (feature_key = 'ticket-office-statements-v2' AND company_id = public.current_company_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (feature_key = 'ticket-office-statements-v2' AND company_id = public.current_company_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY issue303_feature_delete ON public.company_features FOR DELETE TO authenticated
  USING (feature_key = 'ticket-office-statements-v2' AND company_id = public.current_company_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role));

COMMIT;
