-- 0329 — #591-e: fechar os sete ramos NULL manuais restantes.
-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Autorização: 6618640384. Decisões: 6631476546, 6633832088 e 6634415741 (04/11/2026).
-- Executor: E2b; aplicação exclusivamente pelo 0, depois da 0326 já aplicada.
-- ORDEM OBRIGATÓRIA: parte 1 → DML → parte 2. NÃO executar este ficheiro inteiro de seguida.
-- O 0 executa os blocos delimitados, intercalando o ficheiro DML separado com «Corro?»:
-- supabase/manual/dml_0329_issue591_coala_decisions_company.sql
-- Manter a janela sem escritas concorrentes até terminar a parte 2; confirmar §C = 0.
-- A parte 1 não fecha políticas; a parte 2 só se executa depois do DML confirmado.
-- Não aplicar automaticamente por runner/journal: preparar os scripts da janela no PROC-promocao.
-- Prova SELECT antes/depois: docs/testes/issue591/prova-janela-0329-null.sql
-- Rollback: supabase/manual/rollback_0329_issue591_ramo_null_restantes_comentado.sql
-- Fontes: trigger 20260828075636_ef5260d3; Coala 20260525114600_71fedb8d + InitPlan
-- 20260914223845_856916d8; log 20260509212548_ade72c4e + 20260510163231_ee39b3fc;
-- retenção 20260920220454_fe6472d9; equivalência conferida com phase2h-catalog-ddl.json.

-- >>> PARTE 1
-- §0 — Mesmo corpo, SECURITY INVOKER e ACL; só o fallback de empresa do log muda.
CREATE OR REPLACE FUNCTION public.tickets_v2_sync_lot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  v_zone_company_id UUID;
BEGIN
  -- DELETE: trabalho mínimo, registar e sair
  IF TG_OP = 'DELETE' THEN
    -- A zona pode já ter sido apagada (cascade). O lote sabe sempre a empresa.
    SELECT z.event_id, z.company_id INTO v_event_id, v_zone_company_id
    FROM public.event_ticket_zones z WHERE z.id = OLD.zone_id;

    v_company_id := COALESCE(OLD.company_id, v_zone_company_id);

    v_sync_mode := COALESCE(
      (SELECT c.tickets_config -> 'sync_mode' #>> '{}'
         FROM public.companies c WHERE c.id = v_company_id),
      'log_only');

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
      TG_OP, 'would_warn_orphan', NEW.id, v_event_id, NEW.company_id,
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
    v_action := CASE WHEN v_sync_mode = 'active' THEN 'linked_existing' ELSE 'would_link_existing' END;
    v_matched_via := 'exact_name_signature';

    IF v_sync_mode = 'active' THEN
      NEW.ticket_type_id := v_compute.found_type_id;
    END IF;

  ELSE
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
        DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_new_type_id;

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
END $function$;

-- §0b — Preservar o payload actual da UI, que omite company_id.
ALTER TABLE public.coala_sync_decisions ALTER COLUMN company_id SET DEFAULT public.current_company_id();
-- <<< PARTE 1

-- PARAGEM: executar o DML separado, pelo 0 com «Corro?», e confirmar zero NULL.
-- >>> PARTE 2
-- USING conserva NULL só para platform_admin, sem alargar linhas com empresa.
-- WITH CHECK elimina o NULL incondicional; conserva os bypasses existentes.
-- Coala: is_platform_admin(uid) continua a permitir escrita NULL (desvio aceite).
-- Log: o WITH CHECK RESTRICTIVE bloqueia NULL mesmo com o bypass PERMISSIVE.
ALTER POLICY tenant_isolation_select ON crm.meta_creatives_retention_runs
  USING (company_id = public.current_company_id()
    OR (company_id IS NULL AND public.has_role((SELECT auth.uid()), 'platform_admin')));

ALTER POLICY "Admin/manager view sync decisions" ON public.coala_sync_decisions
  USING (((public.has_role((SELECT auth.uid()), 'admin'::public.app_role) OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role) OR public.has_role((SELECT auth.uid()), 'platform_admin'::public.app_role))
    AND (company_id = public.current_company_id() OR public.is_platform_admin((SELECT auth.uid()))))
    OR (company_id IS NULL AND public.has_role((SELECT auth.uid()), 'platform_admin')));

ALTER POLICY "Admin/manager insert sync decisions" ON public.coala_sync_decisions
  WITH CHECK (((public.has_role((SELECT auth.uid()), 'admin'::public.app_role) OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role) OR public.has_role((SELECT auth.uid()), 'platform_admin'::public.app_role))
    AND (company_id = public.current_company_id() OR public.is_platform_admin((SELECT auth.uid())))));

ALTER POLICY "Admin/manager update sync decisions" ON public.coala_sync_decisions
  USING (((public.has_role((SELECT auth.uid()), 'admin'::public.app_role) OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role) OR public.has_role((SELECT auth.uid()), 'platform_admin'::public.app_role))
    AND (company_id = public.current_company_id() OR public.is_platform_admin((SELECT auth.uid()))))
    OR (company_id IS NULL AND public.has_role((SELECT auth.uid()), 'platform_admin')))
  WITH CHECK (((public.has_role((SELECT auth.uid()), 'admin'::public.app_role) OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role) OR public.has_role((SELECT auth.uid()), 'platform_admin'::public.app_role))
    AND (company_id = public.current_company_id() OR public.is_platform_admin((SELECT auth.uid())))));

ALTER POLICY "Admin/manager delete sync decisions" ON public.coala_sync_decisions
  USING (((public.has_role((SELECT auth.uid()), 'admin'::public.app_role) OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role) OR public.has_role((SELECT auth.uid()), 'platform_admin'::public.app_role))
    AND (company_id = public.current_company_id() OR public.is_platform_admin((SELECT auth.uid()))))
    OR (company_id IS NULL AND public.has_role((SELECT auth.uid()), 'platform_admin')));

ALTER POLICY company_isolation_tickets_v2_sync_log ON public.tickets_v2_sync_log
  USING (company_id = public.current_company_id()
    OR (company_id IS NULL AND public.has_role((SELECT auth.uid()), 'platform_admin')))
  WITH CHECK (company_id = public.current_company_id());

ALTER POLICY "Sync log insertable by authenticated tenant" ON public.tickets_v2_sync_log
  WITH CHECK (company_id = public.current_company_id() OR public.is_platform_admin());
-- <<< PARTE 2
