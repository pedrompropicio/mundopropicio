-- ============================================================================
-- FASE TICKETS V2 — BATCH 02: TRIGGERS EM MODO LOG-ONLY (Fase 2.1)
-- ============================================================================
-- Status: ✓ EXECUTADO
-- Data: 2026-05-09
--
-- Este ficheiro reproduz o estado FINAL após a Fase 2.1, extraído de produção
-- via pg_get_functiondef. Idempotente.
--
-- O que cria:
--   1) Tabela tickets_v2_sync_log (com RLS por empresa)
--   2) Função compute_ticket_type_for_lot (heurística estável de matching)
--   3) Função handler tickets_v2_sync_lot (modo log_only / off)
--   4) Trigger AFTER INSERT/UPDATE/DELETE em event_ticket_lots
--   5) 3 views de monitorização
--
-- Princípio: NÃO altera comportamento de runtime — só observa e regista.
-- ============================================================================

BEGIN;

-- ─── 1) Tabela tickets_v2_sync_log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tickets_v2_sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  company_id UUID,
  event_id UUID,
  lot_id UUID,
  operation TEXT NOT NULL CHECK (operation = ANY (ARRAY['INSERT','UPDATE','DELETE'])),
  trigger_action TEXT NOT NULL,
  proposed_type_id UUID,
  proposed_type_name TEXT,
  proposed_zone_signature UUID[],
  matched_via TEXT,
  warnings TEXT[],
  context JSONB,
  sync_mode TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tickets_v2_sync_log_pkey PRIMARY KEY (id),
  CONSTRAINT tickets_v2_sync_log_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tickets_v2_sync_log_created
  ON public.tickets_v2_sync_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_v2_sync_log_company
  ON public.tickets_v2_sync_log (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_v2_sync_log_action
  ON public.tickets_v2_sync_log (trigger_action);
CREATE INDEX IF NOT EXISTS idx_tickets_v2_sync_log_warnings
  ON public.tickets_v2_sync_log USING gin (warnings)
  WHERE warnings IS NOT NULL AND cardinality(warnings) > 0;

ALTER TABLE public.tickets_v2_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sync log viewable by admin/manager"
  ON public.tickets_v2_sync_log FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role)
         OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY company_isolation_tickets_v2_sync_log
  ON public.tickets_v2_sync_log AS RESTRICTIVE FOR ALL TO public
  USING (company_id IS NULL OR company_id = current_company_id())
  WITH CHECK (company_id IS NULL OR company_id = current_company_id());

-- ─── 2) Função compute_ticket_type_for_lot ─────────────────────────────────
-- Heurística estável: dado um lot (nome, zona âncora, is_combo,
-- consumes_zone_ids, applies_to_days, version_id), determina o tipo
-- correspondente — match existente ou propõe criação.
CREATE OR REPLACE FUNCTION public.compute_ticket_type_for_lot(
  p_lot_name TEXT,
  p_zone_id UUID,
  p_is_combo BOOLEAN,
  p_consumes_zones UUID[],
  p_applies_to_days INTEGER,
  p_version_id UUID
)
RETURNS TABLE(
  base_name TEXT,
  is_real_combo BOOLEAN,
  zone_signature UUID[],
  proposed_type_name TEXT,
  proposed_kind TEXT,
  found_type_id UUID,
  warnings TEXT[]
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_event_id          UUID;
  v_zone_name         TEXT;
  v_session_label     TEXT;
  v_base_name         TEXT;
  v_is_real_combo     BOOLEAN;
  v_zone_signature    UUID[];
  v_kind              TEXT;
  v_proposed_name     TEXT;
  v_existing_with_name INT;
  v_existing_with_name_zone INT;
  v_found_id          UUID;
  v_warnings          TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- 1) resolver event_id e zone_name
  SELECT z.event_id, z.name, s.label
    INTO v_event_id, v_zone_name, v_session_label
  FROM public.event_ticket_zones z
  LEFT JOIN public.event_sessions s ON s.id = z.session_id
  WHERE z.id = p_zone_id;

  IF v_event_id IS NULL THEN
    v_warnings := array_append(v_warnings, 'orphan_zone:' || COALESCE(p_zone_id::text,'null'));
    RETURN QUERY SELECT
      NULL::TEXT, NULL::BOOLEAN, NULL::UUID[],
      NULL::TEXT, NULL::TEXT, NULL::UUID, v_warnings;
    RETURN;
  END IF;

  -- 2) extrair nome-base
  v_base_name := TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        CASE WHEN p_lot_name ~* '\s\|\s' THEN SPLIT_PART(p_lot_name, '|', 2) ELSE p_lot_name END,
        '\s*-\s*[Ll]ote\s*\d+\s*$', '', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );

  -- 3) combo "real" = is_combo + ≥2 zonas
  v_is_real_combo := COALESCE(p_is_combo, false)
                     AND p_consumes_zones IS NOT NULL
                     AND cardinality(p_consumes_zones) >= 2;

  -- 4) signature
  IF v_is_real_combo THEN
    SELECT array_agg(zid ORDER BY zid::text) INTO v_zone_signature
    FROM unnest(p_consumes_zones) zid;
  ELSE
    v_zone_signature := ARRAY[p_zone_id];
  END IF;

  -- 5) kind
  v_kind := CASE
    WHEN v_is_real_combo AND COALESCE(p_applies_to_days, 1) >= 2 THEN 'multi_day_pass'
    ELSE 'single_day'
  END;

  -- 6) Conta tipos existentes para detectar colisão de nomes
  SELECT count(*) INTO v_existing_with_name
  FROM public.event_ticket_types tt
  WHERE tt.event_id = v_event_id
    AND tt.name = v_base_name
    AND COALESCE(tt.version_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_version_id, '00000000-0000-0000-0000-000000000000'::uuid);

  SELECT count(*) INTO v_existing_with_name_zone
  FROM public.event_ticket_types tt
  WHERE tt.event_id = v_event_id
    AND tt.name = (v_base_name || ' — ' || v_zone_name)
    AND COALESCE(tt.version_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_version_id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- 7) Match: tipo cuja junction == signature actual
  SELECT tt.id INTO v_found_id
  FROM public.event_ticket_types tt
  WHERE tt.event_id = v_event_id
    AND COALESCE(tt.version_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_version_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      SELECT array_agg(zone_id ORDER BY zone_id::text)
      FROM public.event_ticket_type_zones
      WHERE ticket_type_id = tt.id
    ) = v_zone_signature
    AND (
      tt.name = v_base_name
      OR tt.name = (v_base_name || ' — ' || v_zone_name)
      OR tt.name = (v_base_name || ' — ' || v_zone_name || ' (' || COALESCE(v_session_label,'') || ')')
    )
  ORDER BY
    CASE WHEN tt.name = v_base_name THEN 0
         WHEN tt.name = (v_base_name || ' — ' || v_zone_name) THEN 1
         ELSE 2 END
  LIMIT 1;

  -- 8) Nome proposto se vai criar
  IF v_found_id IS NULL THEN
    IF v_existing_with_name = 0 THEN
      v_proposed_name := v_base_name;
    ELSIF v_existing_with_name_zone = 0 THEN
      v_proposed_name := v_base_name || ' — ' || v_zone_name;
    ELSE
      v_proposed_name := v_base_name || ' — ' || v_zone_name
                       || COALESCE(' (' || v_session_label || ')', '');
    END IF;
  ELSE
    v_proposed_name := (SELECT name FROM public.event_ticket_types WHERE id = v_found_id);
  END IF;

  -- 9) Avisos
  IF p_consumes_zones IS NOT NULL
     AND cardinality(p_consumes_zones) > 0
     AND NOT (p_zone_id = ANY(p_consumes_zones))
  THEN
    v_warnings := array_append(v_warnings, 'consumes_does_not_include_anchor');
  END IF;
  IF COALESCE(p_is_combo, false) AND (p_consumes_zones IS NULL OR cardinality(p_consumes_zones) = 0) THEN
    v_warnings := array_append(v_warnings, 'combo_with_empty_consumes');
  END IF;

  RETURN QUERY SELECT
    v_base_name, v_is_real_combo, v_zone_signature,
    v_proposed_name, v_kind, v_found_id, v_warnings;
END $$;

-- ─── 3) Função handler tickets_v2_sync_lot (modo log_only / off) ───────────
CREATE OR REPLACE FUNCTION public.tickets_v2_sync_lot()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_company_id  UUID;
  v_event_id    UUID;
  v_sync_mode   TEXT;
  v_feature_v2  BOOLEAN;
  v_compute     RECORD;
  v_action      TEXT;
  v_matched_via TEXT;
  v_lot_row     event_ticket_lots;
BEGIN
  v_lot_row := COALESCE(NEW, OLD);

  -- 1) Resolver company_id
  SELECT z.event_id, z.company_id INTO v_event_id, v_company_id
  FROM public.event_ticket_zones z
  WHERE z.id = v_lot_row.zone_id;

  IF v_company_id IS NULL THEN
    INSERT INTO public.tickets_v2_sync_log (
      operation, trigger_action, lot_id, event_id, company_id,
      warnings, sync_mode, context
    ) VALUES (
      TG_OP, 'would_warn_orphan', v_lot_row.id, v_event_id, NULL,
      ARRAY['cannot_resolve_company'], 'log_only',
      jsonb_build_object('zone_id', v_lot_row.zone_id)
    );
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    COALESCE(c.tickets_config -> 'sync_mode' #>> '{}', 'log_only'),
    COALESCE(c.feature_tickets_v2, false)
  INTO v_sync_mode, v_feature_v2
  FROM public.companies c WHERE c.id = v_company_id;

  -- Escape hatch
  IF v_sync_mode = 'off' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- 2) DELETE: regista snapshot
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.tickets_v2_sync_log (
      operation, trigger_action, lot_id, event_id, company_id,
      sync_mode, context
    ) VALUES (
      'DELETE', 'would_unlink', v_lot_row.id, v_event_id, v_company_id, v_sync_mode,
      jsonb_build_object(
        'old_ticket_type_id', OLD.ticket_type_id,
        'old_zone_id', OLD.zone_id,
        'old_name', OLD.name
      )
    );
    RETURN OLD;
  END IF;

  -- 3) ticket_type_id explícito → respeita
  IF NEW.ticket_type_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.event_ticket_types tt
      WHERE tt.id = NEW.ticket_type_id AND tt.event_id = v_event_id
    ) THEN
      INSERT INTO public.tickets_v2_sync_log (
        operation, trigger_action, lot_id, event_id, company_id,
        proposed_type_id, warnings, sync_mode, context
      ) VALUES (
        TG_OP, 'would_warn_invalid_type', NEW.id, v_event_id, v_company_id,
        NEW.ticket_type_id,
        ARRAY['ticket_type_id_not_in_event_or_missing'],
        v_sync_mode,
        jsonb_build_object('lot', to_jsonb(NEW))
      );
    ELSE
      INSERT INTO public.tickets_v2_sync_log (
        operation, trigger_action, lot_id, event_id, company_id,
        proposed_type_id, matched_via, sync_mode, context
      ) VALUES (
        TG_OP, 'would_skip_explicit_id', NEW.id, v_event_id, v_company_id,
        NEW.ticket_type_id, 'preserved_existing', v_sync_mode,
        jsonb_build_object('lot_name', NEW.name)
      );
    END IF;
    RETURN NEW;
  END IF;

  -- 4) Aplicar heurística
  SELECT * INTO v_compute
  FROM public.compute_ticket_type_for_lot(
    NEW.name, NEW.zone_id, NEW.is_combo, NEW.consumes_zone_ids,
    NEW.applies_to_days, NEW.version_id
  );

  IF v_compute.found_type_id IS NOT NULL THEN
    v_action := 'would_link_existing';
    v_matched_via := 'exact_name_signature';
  ELSE
    IF v_feature_v2 THEN
      v_action := 'would_warn_missing_type';
      v_compute.warnings := array_append(
        COALESCE(v_compute.warnings, ARRAY[]::TEXT[]),
        'feature_v2_active_but_no_explicit_type'
      );
    ELSE
      v_action := 'would_create_type';
      v_matched_via := 'created_new';
    END IF;
  END IF;

  INSERT INTO public.tickets_v2_sync_log (
    operation, trigger_action, lot_id, event_id, company_id,
    proposed_type_id, proposed_type_name, proposed_zone_signature,
    matched_via, warnings, sync_mode, context
  ) VALUES (
    TG_OP, v_action, NEW.id, v_event_id, v_company_id,
    v_compute.found_type_id, v_compute.proposed_type_name, v_compute.zone_signature,
    v_matched_via,
    NULLIF(v_compute.warnings, ARRAY[]::TEXT[]),
    v_sync_mode,
    jsonb_build_object(
      'lot_name', NEW.name,
      'is_combo', NEW.is_combo,
      'consumes_zone_ids', NEW.consumes_zone_ids,
      'applies_to_days', NEW.applies_to_days,
      'base_name_extracted', v_compute.base_name,
      'is_real_combo', v_compute.is_real_combo,
      'proposed_kind', v_compute.proposed_kind,
      'feature_tickets_v2', v_feature_v2
    )
  );

  -- Em log-only NÃO altera NEW.ticket_type_id (mantém como veio)
  RETURN NEW;
END $$;

-- ─── 4) Trigger ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_tickets_v2_sync ON public.event_ticket_lots;
CREATE TRIGGER trg_tickets_v2_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.event_ticket_lots
  FOR EACH ROW EXECUTE FUNCTION public.tickets_v2_sync_lot();

-- ─── 5) Views de monitorização ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_tickets_v2_sync_summary_7d AS
SELECT c.display_name AS empresa,
       l.trigger_action,
       l.operation,
       count(*) AS qtd,
       count(DISTINCT l.event_id) AS eventos_afetados,
       min(l.created_at) AS primeiro,
       max(l.created_at) AS ultimo
FROM public.tickets_v2_sync_log l
JOIN public.companies c ON c.id = l.company_id
WHERE l.created_at > (now() - interval '7 days')
GROUP BY c.display_name, l.trigger_action, l.operation
ORDER BY c.display_name, l.trigger_action, l.operation;

CREATE OR REPLACE VIEW public.vw_tickets_v2_sync_warnings AS
SELECT l.created_at,
       c.display_name AS empresa,
       e.name AS evento,
       l.operation,
       l.trigger_action,
       l.warnings,
       l.context
FROM public.tickets_v2_sync_log l
LEFT JOIN public.companies c ON c.id = l.company_id
LEFT JOIN public.events e ON e.id = l.event_id
WHERE l.warnings IS NOT NULL
  AND cardinality(l.warnings) > 0
  AND l.created_at > (now() - interval '7 days')
ORDER BY l.created_at DESC;

CREATE OR REPLACE VIEW public.vw_tickets_v2_sync_would_create AS
SELECT l.created_at,
       c.display_name AS empresa,
       e.name AS evento,
       l.proposed_type_name,
       l.context -> 'base_name_extracted' AS base_name,
       l.context -> 'is_real_combo' AS is_combo,
       l.context -> 'lot_name' AS lot_name_original,
       l.lot_id
FROM public.tickets_v2_sync_log l
LEFT JOIN public.companies c ON c.id = l.company_id
LEFT JOIN public.events e ON e.id = l.event_id
WHERE l.trigger_action = 'would_create_type'
  AND l.created_at > (now() - interval '30 days')
ORDER BY l.created_at DESC;

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_tickets_v2_sync ON public.event_ticket_lots;
--   DROP VIEW IF EXISTS public.vw_tickets_v2_sync_summary_7d;
--   DROP VIEW IF EXISTS public.vw_tickets_v2_sync_warnings;
--   DROP VIEW IF EXISTS public.vw_tickets_v2_sync_would_create;
--   DROP FUNCTION IF EXISTS public.tickets_v2_sync_lot();
--   DROP FUNCTION IF EXISTS public.compute_ticket_type_for_lot(text, uuid, boolean, uuid[], integer, uuid);
--   DROP TABLE IF EXISTS public.tickets_v2_sync_log;
-- COMMIT;
