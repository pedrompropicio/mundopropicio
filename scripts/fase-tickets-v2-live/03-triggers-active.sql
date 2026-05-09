-- ============================================================================
-- FASE TICKETS V2 — BATCH 03: TRIGGERS EM MODO ACTIVE
-- ============================================================================
-- Pré-requisitos:
--   - Batch 01 (DDL + populate) executado e validado.
--   - Batch 02 (triggers em log-only) executado.
--   - Pelo menos 24-48h de observação em log-only sem warnings inesperados.
--   - Suite SQL `tickets_v2_run_all_tests()` a passar 33/33.
--
-- O que muda neste batch:
--   - Função `tickets_v2_sync_lot()` é substituída por uma versão que:
--     * Em modo `log_only` (default) → comportamento idêntico ao actual.
--     * Em modo `active`:
--         - INSERT/UPDATE sem ticket_type_id, e tipo existe na heurística
--             → preenche NEW.ticket_type_id (link automático).
--         - INSERT/UPDATE sem ticket_type_id, tipo NÃO existe, feature_v2=false
--             → cria event_ticket_type + junction + preenche NEW.ticket_type_id.
--         - INSERT/UPDATE sem ticket_type_id, tipo NÃO existe, feature_v2=true
--             → RAISE EXCEPTION (recusa o save, força explicitação).
--         - INSERT/UPDATE com ticket_type_id explícito
--             → valida que pertence ao evento; se inválido, RAISE EXCEPTION.
--         - DELETE → regista snapshot (igual ao log-only).
--     * Em modo `off` → não faz nada (escape hatch).
--
-- Mudança estrutural:
--   - Trigger passa de AFTER para BEFORE para permitir alterar NEW.ticket_type_id.
--   - O log continua a ser escrito (em todos os modos exceto `off`).
--
-- Princípio: nenhuma empresa passa a `active` automaticamente. Este batch só
-- altera a CAPACIDADE do trigger — a activação por empresa é feita por
-- batches subsequentes (04-activate-coala.sql, 05-activate-mp.sql), com
-- janela de observação entre uma e a outra.
--
-- Rollback: comentado no fim do ficheiro.
-- ============================================================================

BEGIN;

-- ─── 1) Substituir a função handler ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tickets_v2_sync_lot()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_company_id     UUID;
  v_event_id       UUID;
  v_sync_mode      TEXT;
  v_feature_v2     BOOLEAN;
  v_compute        RECORD;
  v_action         TEXT;
  v_matched_via    TEXT;
  v_lot_row        public.event_ticket_lots;
  v_zone_id        UUID;
  v_new_type_id    UUID;
BEGIN
  -- DELETE: trabalho mínimo, registar e sair
  IF TG_OP = 'DELETE' THEN
    SELECT z.event_id, z.company_id INTO v_event_id, v_company_id
    FROM public.event_ticket_zones z WHERE z.id = OLD.zone_id;

    SELECT COALESCE(c.tickets_config -> 'sync_mode' #>> '{}', 'log_only')
    INTO v_sync_mode
    FROM public.companies c WHERE c.id = v_company_id;

    IF v_sync_mode = 'off' THEN
      RETURN OLD;
    END IF;

    INSERT INTO public.tickets_v2_sync_log (
      operation, trigger_action, lot_id, event_id, company_id,
      sync_mode, context
    ) VALUES (
      'DELETE', 'would_unlink', OLD.id, v_event_id, v_company_id, v_sync_mode,
      jsonb_build_object(
        'old_ticket_type_id', OLD.ticket_type_id,
        'old_zone_id', OLD.zone_id,
        'old_name', OLD.name
      )
    );
    RETURN OLD;
  END IF;

  -- INSERT/UPDATE: usar NEW
  v_lot_row := NEW;

  -- 1) Resolver company_id e sync_mode
  SELECT z.event_id, z.company_id INTO v_event_id, v_company_id
  FROM public.event_ticket_zones z
  WHERE z.id = NEW.zone_id;

  IF v_company_id IS NULL THEN
    INSERT INTO public.tickets_v2_sync_log (
      operation, trigger_action, lot_id, event_id, company_id,
      warnings, sync_mode, context
    ) VALUES (
      TG_OP, 'would_warn_orphan', NEW.id, v_event_id, NULL,
      ARRAY['cannot_resolve_company'], 'log_only',
      jsonb_build_object('zone_id', NEW.zone_id)
    );
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(c.tickets_config -> 'sync_mode' #>> '{}', 'log_only'),
    COALESCE(c.feature_tickets_v2, false)
  INTO v_sync_mode, v_feature_v2
  FROM public.companies c WHERE c.id = v_company_id;

  -- Escape hatch
  IF v_sync_mode = 'off' THEN
    RETURN NEW;
  END IF;

  -- 2) Se NEW.ticket_type_id já vem preenchido pela aplicação, validar e respeitar
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
      -- Em active, recusar save
      IF v_sync_mode = 'active' THEN
        RAISE EXCEPTION 'tickets_v2: ticket_type_id % não pertence ao evento %',
          NEW.ticket_type_id, v_event_id;
      END IF;
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

  -- 3) Não veio ticket_type_id → aplicar heurística
  SELECT * INTO v_compute
  FROM public.compute_ticket_type_for_lot(
    NEW.name, NEW.zone_id, NEW.is_combo, NEW.consumes_zone_ids,
    NEW.applies_to_days, NEW.version_id
  );

  IF v_compute.found_type_id IS NOT NULL THEN
    -- 3a) Match com tipo existente
    v_action := CASE WHEN v_sync_mode = 'active' THEN 'linked_existing' ELSE 'would_link_existing' END;
    v_matched_via := 'exact_name_signature';

    IF v_sync_mode = 'active' THEN
      NEW.ticket_type_id := v_compute.found_type_id;
    END IF;

  ELSE
    -- 3b) Sem match: criar tipo (modo legacy) ou recusar (modo novo)
    IF v_feature_v2 THEN
      v_action := 'would_warn_missing_type';
      v_compute.warnings := array_append(
        COALESCE(v_compute.warnings, ARRAY[]::TEXT[]),
        'feature_v2_active_but_no_explicit_type'
      );
      IF v_sync_mode = 'active' THEN
        RAISE EXCEPTION
          'tickets_v2: feature_v2 ativo mas ticket_type_id não foi fornecido para lot "%".'
          ' Crie o tipo explicitamente na UI nova ou desactive feature_v2.',
          NEW.name;
      END IF;
    ELSE
      v_action := CASE WHEN v_sync_mode = 'active' THEN 'created_type' ELSE 'would_create_type' END;
      v_matched_via := 'created_new';

      IF v_sync_mode = 'active' THEN
        -- Criar event_ticket_type
        INSERT INTO public.event_ticket_types (
          event_id, company_id, name, kind,
          entries_per_unit, max_total_quantity,
          parent_ticket_type_id, variant_kind, variant_label,
          visibility, version_id
        ) VALUES (
          v_event_id, v_company_id, v_compute.proposed_type_name, v_compute.proposed_kind,
          1, NULL,
          NULL, NULL, NULL,
          'public', NEW.version_id
        )
        ON CONFLICT (event_id, name, COALESCE(version_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET name = EXCLUDED.name -- garante RETURNING
        RETURNING id INTO v_new_type_id;

        -- Criar junction para cada zona da assinatura
        FOREACH v_zone_id IN ARRAY v_compute.zone_signature LOOP
          INSERT INTO public.event_ticket_type_zones (
            ticket_type_id, zone_id, display_order, price_share, company_id
          ) VALUES (
            v_new_type_id, v_zone_id, 0, NULL, v_company_id
          )
          ON CONFLICT (ticket_type_id, zone_id) DO NOTHING;
        END LOOP;

        NEW.ticket_type_id := v_new_type_id;
      END IF;
    END IF;
  END IF;

  -- 4) Registar no log
  INSERT INTO public.tickets_v2_sync_log (
    operation, trigger_action, lot_id, event_id, company_id,
    proposed_type_id, proposed_type_name, proposed_zone_signature,
    matched_via, warnings, sync_mode, context
  ) VALUES (
    TG_OP, v_action, NEW.id, v_event_id, v_company_id,
    COALESCE(NEW.ticket_type_id, v_compute.found_type_id),
    v_compute.proposed_type_name, v_compute.zone_signature,
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
      'feature_tickets_v2', v_feature_v2,
      'created_new_type_id', v_new_type_id
    )
  );

  RETURN NEW;
END $$;

-- ─── 2) Mudar trigger de AFTER para BEFORE ──────────────────────────────────
DROP TRIGGER IF EXISTS trg_tickets_v2_sync ON public.event_ticket_lots;

CREATE TRIGGER trg_tickets_v2_sync
  BEFORE INSERT OR UPDATE OR DELETE ON public.event_ticket_lots
  FOR EACH ROW EXECUTE FUNCTION public.tickets_v2_sync_lot();

-- ─── 3) Validar: triggers continuam a passar ───────────────────────────────
DO $$
DECLARE
  v_failed int;
BEGIN
  SELECT count(*) INTO v_failed
  FROM public.tickets_v2_run_all_tests()
  WHERE NOT passed;

  IF v_failed > 0 THEN
    RAISE EXCEPTION 'BATCH 03 FAILED: % testes da suite SQL falharam', v_failed;
  END IF;

  RAISE NOTICE 'BATCH 03 OK — handler atualizado, suite continua verde, nenhuma empresa em active.';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK (descomentar e correr para reverter)
-- ============================================================================
-- BEGIN;
--   -- Recriar a função antiga (versão log-only pura, do batch 02)
--   -- Ver scripts/fase-tickets-v2-live/02-triggers-log-only.sql
--   DROP TRIGGER IF EXISTS trg_tickets_v2_sync ON public.event_ticket_lots;
--   CREATE TRIGGER trg_tickets_v2_sync
--     AFTER INSERT OR UPDATE OR DELETE ON public.event_ticket_lots
--     FOR EACH ROW EXECUTE FUNCTION public.tickets_v2_sync_lot();
--   -- Forçar todas as empresas para log_only
--   UPDATE public.companies
--   SET tickets_config = jsonb_set(tickets_config, '{sync_mode}', '"log_only"')
--   WHERE COALESCE(tickets_config -> 'sync_mode' #>> '{}', '') <> 'log_only';
-- COMMIT;
