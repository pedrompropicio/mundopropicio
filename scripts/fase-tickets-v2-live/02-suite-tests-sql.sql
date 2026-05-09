-- ============================================================================
-- FASE TICKETS V2 — BATCH 02-suite-tests-sql: SUITE SQL DE TESTES (Fase 2.5 Parte A)
-- ============================================================================
-- Status: ✓ EXECUTADO — 33/33 testes verdes
-- Data: 2026-05-09
--
-- Cria 3 funções de teste + 1 wrapper + 1 view de health check.
-- Idempotente. Reproduz o estado actual em produção.
--
-- Sub-suites:
--   - compute_function (12 testes da função compute_ticket_type_for_lot)
--   - trigger_log_only (11 testes do trigger em modo log-only)
--   - invariants (10 testes de reconciliação aplicados a TODA a base)
--
-- Como correr:
--   SELECT * FROM public.tickets_v2_run_all_tests();
--   SELECT * FROM public.vw_tickets_v2_test_health;
-- ============================================================================

BEGIN;

-- ─── Sub-suite 1: compute_function (12 testes) ─────────────────────────────
CREATE OR REPLACE FUNCTION public._test_tickets_v2_compute_function()
RETURNS TABLE(test_name TEXT, passed BOOLEAN, detail TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  z_relvado_sab UUID := 'd128ce5f-38dd-48f0-b968-2ce05d776b54';
  z_relvado_dom UUID := '0c8ac3fc-4331-4716-bc8b-b2548d6b04cb';
  z_tenda_sab   UUID := '1d38002b-4412-4553-967b-c0779ec26aad';
  z_tenda_dom   UUID := 'fed72d2b-34ad-441b-a116-660c23c2ea11';
BEGIN
  -- T1: simples-fase-numerica:match-existente
  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'Entrada Diária | Relvado Sábado 30 Maio - lote 5',
    z_relvado_sab, false, NULL, 1, NULL
  );
  RETURN QUERY SELECT
    'T1 simples-fase-numerica:match-existente'::TEXT,
    (r.found_type_id IS NOT NULL AND r.proposed_type_name = 'Relvado Sábado 30 Maio'),
    'base=' || r.base_name || ' name=' || r.proposed_type_name;

  -- T2: combo-conhecido:match
  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'Lote 99 | Passe Geral Relvado 2 dias',
    z_relvado_sab, true, ARRAY[z_relvado_sab, z_relvado_dom], 2, NULL
  );
  RETURN QUERY SELECT
    'T2 combo-conhecido:match'::TEXT,
    (r.found_type_id IS NOT NULL
     AND r.proposed_type_name = 'Passe Geral Relvado 2 dias'
     AND r.is_real_combo = true
     AND r.proposed_kind = 'multi_day_pass'),
    'base=' || r.base_name || ' kind=' || r.proposed_kind;

  -- T3: combo-tenda:match-correto
  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'Lote 7 | Passe VIP Tenda 2 dias',
    z_tenda_sab, true, ARRAY[z_tenda_sab, z_tenda_dom], 2, NULL
  );
  RETURN QUERY SELECT
    'T3 combo-tenda:match-correto'::TEXT,
    (r.found_type_id IS NOT NULL AND r.proposed_type_name = 'Passe VIP Tenda 2 dias'),
    'name=' || r.proposed_type_name;

  -- T4: simples-novo:cria-tipo
  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'Camarote Premium 2 Dias',
    z_relvado_sab, false, NULL, 1, NULL
  );
  RETURN QUERY SELECT
    'T4 simples-novo:cria-tipo'::TEXT,
    (r.found_type_id IS NULL AND r.proposed_type_name = 'Camarote Premium 2 Dias'),
    'name=' || r.proposed_type_name;

  -- T5: combo-consumes-vazio:warning
  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'Passe Estranho',
    z_relvado_sab, true, ARRAY[]::uuid[], 2, NULL
  );
  RETURN QUERY SELECT
    'T5 combo-consumes-vazio:warning'::TEXT,
    ('combo_with_empty_consumes' = ANY(r.warnings)),
    'warnings=' || array_to_string(r.warnings, ',');

  -- T6: combo-anchor-fora-consumes:warning
  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'Lote 1 | Passe Geral Relvado 2 dias',
    z_tenda_sab, true,
    ARRAY[z_relvado_sab, z_relvado_dom],
    2, NULL
  );
  RETURN QUERY SELECT
    'T6 combo-anchor-fora-consumes:warning'::TEXT,
    ('consumes_does_not_include_anchor' = ANY(r.warnings)),
    'warnings=' || array_to_string(r.warnings, ',');

  -- T7: zona-inexistente:warning
  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'Whatever', '00000000-0000-0000-0000-000000000000'::uuid,
    false, NULL, 1, NULL
  );
  RETURN QUERY SELECT
    'T7 zona-inexistente:warning'::TEXT,
    (r.found_type_id IS NULL
     AND r.base_name IS NULL
     AND EXISTS (SELECT 1 FROM unnest(r.warnings) w WHERE w LIKE 'orphan_zone:%')),
    'warnings=' || array_to_string(r.warnings, ',');

  -- T8: regex-sem-sufixo-lote:base-puro
  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'Tag | Nome Sem Lote',
    z_relvado_sab, false, NULL, 1, NULL
  );
  RETURN QUERY SELECT
    'T8 regex-sem-sufixo-lote:base-puro'::TEXT,
    (r.base_name = 'Nome Sem Lote'),
    'base=' || r.base_name;

  -- T9: regex-sem-pipe:base-puro
  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'Nome Direto',
    z_relvado_sab, false, NULL, 1, NULL
  );
  RETURN QUERY SELECT
    'T9 regex-sem-pipe:base-puro'::TEXT,
    (r.base_name = 'Nome Direto'),
    'base=' || r.base_name;

  -- T10: regex-sufixo-Lote-maiusculo:remove
  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'Tag | Nome Composto - Lote 7',
    z_relvado_sab, false, NULL, 1, NULL
  );
  RETURN QUERY SELECT
    'T10 regex-sufixo-Lote-maiusculo:remove'::TEXT,
    (r.base_name = 'Nome Composto'),
    'base=' || r.base_name;

  -- T11: combo-1-zona:tratado-como-simples
  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'Passe Curioso 1 dia',
    z_relvado_sab, true, ARRAY[z_relvado_sab], 1, NULL
  );
  RETURN QUERY SELECT
    'T11 combo-1-zona:tratado-como-simples'::TEXT,
    (r.is_real_combo = false AND r.proposed_kind = 'single_day'),
    'is_real_combo=' || r.is_real_combo::TEXT || ' kind=' || r.proposed_kind;

  -- T12: signature-ordenacao-deterministica
  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'X | Passe Geral Relvado 2 dias',
    z_relvado_sab, true,
    ARRAY[z_relvado_dom, z_relvado_sab],
    2, NULL
  );
  RETURN QUERY SELECT
    'T12 signature-ordenacao-deterministica'::TEXT,
    (r.zone_signature[1]::TEXT < r.zone_signature[2]::TEXT),
    'sig=' || array_to_string(r.zone_signature::TEXT[], ',');
END $$;

-- ─── Sub-suite 2: trigger_log_only (11 testes) ─────────────────────────────
CREATE OR REPLACE FUNCTION public._test_tickets_v2_trigger_log_only()
RETURNS TABLE(test_name TEXT, passed BOOLEAN, detail TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_lot_id_1 UUID;
  v_lot_id_2 UUID;
  v_lot_id_3 UUID;
  v_lot_id_4 UUID;
  v_baseline_lots INT;
  v_baseline_types INT;
  v_company_coala UUID := '7d831e59-6e82-427b-95a0-64904aae5dd2';
  v_zone_relvado_sab UUID := 'd128ce5f-38dd-48f0-b968-2ce05d776b54';
  v_zone_relvado_dom UUID := '0c8ac3fc-4331-4716-bc8b-b2548d6b04cb';
  v_existing_type_relvado_sab UUID;
BEGIN
  SELECT count(*) INTO v_baseline_lots FROM public.event_ticket_lots;
  SELECT count(*) INTO v_baseline_types FROM public.event_ticket_types;
  SELECT id INTO v_existing_type_relvado_sab
  FROM public.event_ticket_types
  WHERE event_id = '5a1da5fb-3115-4ae3-af50-15ce1f869a5c'
    AND name = 'Relvado Sábado 30 Maio';

  -- T1: log-only NÃO altera ticket_type_id
  INSERT INTO public.event_ticket_lots (
    zone_id, lot_number, name, quantity, price, iva_rate,
    lot_type, lot_kind, applies_to_days, is_combo, consumes_zone_ids, company_id
  ) VALUES (
    v_zone_relvado_sab, 991, '_TESTSUITE_T1 | Relvado Sábado 30 Maio - lote 5',
    10, 60, 6, 'regular', 'simple', 1, false, ARRAY[]::uuid[], v_company_coala
  ) RETURNING id INTO v_lot_id_1;

  RETURN QUERY SELECT
    'T1 trigger-log-only:nao-altera-ticket_type_id'::TEXT,
    ((SELECT ticket_type_id FROM public.event_ticket_lots WHERE id = v_lot_id_1) IS NULL),
    'lot inserido sem type_id mantém-se NULL';

  RETURN QUERY SELECT
    'T1b trigger-log-only:cria-log-INSERT'::TEXT,
    ((SELECT count(*) FROM public.tickets_v2_sync_log
      WHERE lot_id = v_lot_id_1 AND operation = 'INSERT') = 1),
    'log INSERT criado';

  -- T2: matching-nome-conhecido
  RETURN QUERY SELECT
    'T2 trigger-log:matching-nome-conhecido'::TEXT,
    ((SELECT trigger_action FROM public.tickets_v2_sync_log WHERE lot_id = v_lot_id_1 AND operation = 'INSERT')
     = 'would_link_existing'),
    'action expected = would_link_existing';

  -- T3: cria-tipo-quando-novo
  INSERT INTO public.event_ticket_lots (
    zone_id, lot_number, name, quantity, price, iva_rate,
    lot_type, lot_kind, applies_to_days, is_combo, consumes_zone_ids, company_id
  ) VALUES (
    v_zone_relvado_sab, 992, '_TESTSUITE_T3 Tipo Inédito XYZ',
    10, 60, 6, 'regular', 'simple', 1, false, ARRAY[]::uuid[], v_company_coala
  ) RETURNING id INTO v_lot_id_2;

  RETURN QUERY SELECT
    'T3 trigger-log:cria-tipo-quando-novo'::TEXT,
    ((SELECT trigger_action FROM public.tickets_v2_sync_log WHERE lot_id = v_lot_id_2 AND operation = 'INSERT')
     = 'would_create_type'),
    'action expected = would_create_type';

  -- T4: respeita-ticket_type_id-explicito
  INSERT INTO public.event_ticket_lots (
    zone_id, lot_number, name, quantity, price, iva_rate,
    lot_type, lot_kind, applies_to_days, is_combo, consumes_zone_ids, company_id,
    ticket_type_id
  ) VALUES (
    v_zone_relvado_sab, 993, '_TESTSUITE_T4 Whatever',
    10, 60, 6, 'regular', 'simple', 1, false, ARRAY[]::uuid[], v_company_coala,
    v_existing_type_relvado_sab
  ) RETURNING id INTO v_lot_id_3;

  RETURN QUERY SELECT
    'T4 trigger-log:respeita-ticket_type_id-explicito'::TEXT,
    ((SELECT trigger_action FROM public.tickets_v2_sync_log WHERE lot_id = v_lot_id_3 AND operation = 'INSERT')
     = 'would_skip_explicit_id'),
    'action expected = would_skip_explicit_id';

  -- T5: registra-UPDATE
  UPDATE public.event_ticket_lots SET price = 99 WHERE id = v_lot_id_1;
  RETURN QUERY SELECT
    'T5 trigger-log:registra-UPDATE'::TEXT,
    ((SELECT count(*) FROM public.tickets_v2_sync_log
      WHERE lot_id = v_lot_id_1 AND operation = 'UPDATE') >= 1),
    'log UPDATE existe';

  -- T6: registra-DELETE-com-snapshot
  DELETE FROM public.event_ticket_lots WHERE id = v_lot_id_1;
  RETURN QUERY SELECT
    'T6 trigger-log:registra-DELETE-com-snapshot'::TEXT,
    EXISTS (
      SELECT 1 FROM public.tickets_v2_sync_log
      WHERE lot_id = v_lot_id_1 AND operation = 'DELETE'
        AND context -> 'old_name' IS NOT NULL
    ),
    'log DELETE com snapshot do nome';

  -- T7: combo-conhecido-match
  INSERT INTO public.event_ticket_lots (
    zone_id, lot_number, name, quantity, price, iva_rate,
    lot_type, lot_kind, applies_to_days, is_combo, consumes_zone_ids, company_id
  ) VALUES (
    v_zone_relvado_sab, 994, '_TESTSUITE_T7 Lote N | Passe Geral Relvado 2 dias',
    10, 95, 6, 'regular', 'combo', 2, true,
    ARRAY[v_zone_relvado_sab, v_zone_relvado_dom], v_company_coala
  ) RETURNING id INTO v_lot_id_4;

  RETURN QUERY SELECT
    'T7 trigger-log:combo-conhecido-match'::TEXT,
    ((SELECT trigger_action FROM public.tickets_v2_sync_log WHERE lot_id = v_lot_id_4 AND operation = 'INSERT')
     = 'would_link_existing'),
    'combo conhecido faz match';

  -- T8: nao-cria-tipos-na-base
  RETURN QUERY SELECT
    'T8 log-only:nao-cria-tipos-na-base'::TEXT,
    ((SELECT count(*) FROM public.event_ticket_types) = v_baseline_types),
    'types antes=' || v_baseline_types || ' agora=' || (SELECT count(*) FROM public.event_ticket_types);

  -- T9: nao-altera-type_id-existentes
  RETURN QUERY SELECT
    'T9 log-only:nao-altera-type_id-existentes'::TEXT,
    ((SELECT ticket_type_id FROM public.event_ticket_lots WHERE id = v_lot_id_2) IS NULL),
    'lot novo sem type explícito mantém NULL';

  -- Limpeza
  DELETE FROM public.event_ticket_lots WHERE id IN (v_lot_id_2, v_lot_id_3, v_lot_id_4);

  -- T10: cleanup:restaura-baseline
  RETURN QUERY SELECT
    'T10 cleanup:restaura-baseline'::TEXT,
    ((SELECT count(*) FROM public.event_ticket_lots) = v_baseline_lots),
    'lots antes=' || v_baseline_lots || ' agora=' || (SELECT count(*) FROM public.event_ticket_lots);

  DELETE FROM public.tickets_v2_sync_log
  WHERE lot_id IN (v_lot_id_1, v_lot_id_2, v_lot_id_3, v_lot_id_4);
END $$;

-- ─── Sub-suite 3: invariants (10 testes de reconciliação global) ──────────
CREATE OR REPLACE FUNCTION public._test_tickets_v2_invariants()
RETURNS TABLE(test_name TEXT, passed BOOLEAN, detail TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_orphan_lots INT;
  v_types_no_zone INT;
  v_qty_legacy BIGINT;
  v_qty_via_types BIGINT;
  v_combos_divergentes INT;
  v_variantes_profundidade INT;
  v_types_invalido_kind INT;
  v_lots_zone_invalida INT;
BEGIN
  -- I1: todo-lote-tem-ticket_type_id
  SELECT count(*) INTO v_orphan_lots
  FROM public.event_ticket_lots WHERE ticket_type_id IS NULL;
  RETURN QUERY SELECT 'I1 todo-lote-tem-ticket_type_id'::TEXT,
    (v_orphan_lots = 0), 'lots órfãos = ' || v_orphan_lots;

  -- I2: todo-tipo-tem-pelo-menos-uma-zona
  SELECT count(*) INTO v_types_no_zone
  FROM public.event_ticket_types tt
  WHERE NOT EXISTS (
    SELECT 1 FROM public.event_ticket_type_zones WHERE ticket_type_id = tt.id
  );
  RETURN QUERY SELECT 'I2 todo-tipo-tem-pelo-menos-uma-zona'::TEXT,
    (v_types_no_zone = 0), 'tipos sem zona = ' || v_types_no_zone;

  -- I3: soma-quantities-bate-legacy-vs-novo
  SELECT COALESCE(sum(quantity), 0) INTO v_qty_legacy FROM public.event_ticket_lots;
  SELECT COALESCE(sum(l.quantity), 0) INTO v_qty_via_types
  FROM public.event_ticket_lots l
  JOIN public.event_ticket_types tt ON tt.id = l.ticket_type_id;
  RETURN QUERY SELECT 'I3 soma-quantities-bate-legacy-vs-novo'::TEXT,
    (v_qty_legacy = v_qty_via_types),
    'legacy=' || v_qty_legacy || ' via_types=' || v_qty_via_types;

  -- I4: junction-combos-bate-consumes-legacy
  SELECT count(*) INTO v_combos_divergentes
  FROM public.event_ticket_lots l
  JOIN public.event_ticket_types tt ON tt.id = l.ticket_type_id
  WHERE l.is_combo
    AND l.consumes_zone_ids IS NOT NULL
    AND cardinality(l.consumes_zone_ids) >= 2
    AND (
      SELECT array_agg(zone_id ORDER BY zone_id::text)
      FROM public.event_ticket_type_zones WHERE ticket_type_id = tt.id
    ) <> (
      SELECT array_agg(zid ORDER BY zid::text) FROM unnest(l.consumes_zone_ids) zid
    );
  RETURN QUERY SELECT 'I4 junction-combos-bate-consumes-legacy'::TEXT,
    (v_combos_divergentes = 0), 'combos divergentes = ' || v_combos_divergentes;

  -- I5: variantes-profundidade-max-1
  SELECT count(*) INTO v_variantes_profundidade
  FROM public.event_ticket_types child
  JOIN public.event_ticket_types parent ON parent.id = child.parent_ticket_type_id
  WHERE parent.parent_ticket_type_id IS NOT NULL;
  RETURN QUERY SELECT 'I5 variantes-profundidade-max-1'::TEXT,
    (v_variantes_profundidade = 0), 'variantes-de-variantes = ' || v_variantes_profundidade;

  -- I6: todo-tipo-tem-kind-valido
  SELECT count(*) INTO v_types_invalido_kind
  FROM public.event_ticket_types
  WHERE kind NOT IN ('single_day','multi_day_pass','package','session_ticket','custom');
  RETURN QUERY SELECT 'I6 todo-tipo-tem-kind-valido'::TEXT,
    (v_types_invalido_kind = 0), 'kinds inválidos = ' || v_types_invalido_kind;

  -- I7: zonas-da-junction-existem
  SELECT count(*) INTO v_lots_zone_invalida
  FROM public.event_ticket_type_zones ttz
  WHERE NOT EXISTS (SELECT 1 FROM public.event_ticket_zones WHERE id = ttz.zone_id);
  RETURN QUERY SELECT 'I7 zonas-da-junction-existem'::TEXT,
    (v_lots_zone_invalida = 0), 'zonas inexistentes = ' || v_lots_zone_invalida;

  -- I8: variantes-no-mesmo-evento-do-pai
  RETURN QUERY SELECT 'I8 variantes-no-mesmo-evento-do-pai'::TEXT,
    NOT EXISTS (
      SELECT 1 FROM public.event_ticket_types child
      JOIN public.event_ticket_types parent ON parent.id = child.parent_ticket_type_id
      WHERE parent.event_id <> child.event_id
    ), 'verificado';

  -- I9: variantes-tem-variant_kind
  RETURN QUERY SELECT 'I9 variantes-tem-variant_kind'::TEXT,
    NOT EXISTS (
      SELECT 1 FROM public.event_ticket_types
      WHERE parent_ticket_type_id IS NOT NULL AND variant_kind IS NULL
    ), 'verificado';

  -- I10: zona-capacidade-coerente
  RETURN QUERY SELECT 'I10 zona-capacidade-coerente'::TEXT,
    NOT EXISTS (
      SELECT 1 FROM public.event_ticket_zones
      WHERE total_capacity IS NOT NULL AND total_capacity < 0
    ), 'verificado';
END $$;

-- ─── Wrapper ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tickets_v2_run_all_tests()
RETURNS TABLE (suite TEXT, test_name TEXT, passed BOOLEAN, detail TEXT)
LANGUAGE sql AS $$
  SELECT 'compute_function'::TEXT AS suite, t.test_name, t.passed, t.detail
  FROM public._test_tickets_v2_compute_function() t
  UNION ALL
  SELECT 'trigger_log_only', t.test_name, t.passed, t.detail
  FROM public._test_tickets_v2_trigger_log_only() t
  UNION ALL
  SELECT 'invariants', t.test_name, t.passed, t.detail
  FROM public._test_tickets_v2_invariants() t
  ORDER BY 1, 2;
$$;

-- ─── View de health check ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_tickets_v2_test_health AS
SELECT suite,
       count(*) AS total,
       count(*) FILTER (WHERE passed) AS passed,
       count(*) FILTER (WHERE NOT passed) AS failed,
       CASE WHEN count(*) FILTER (WHERE NOT passed) = 0
            THEN '✓ ok'::text
            ELSE '✗ falhas'::text END AS status
FROM public.tickets_v2_run_all_tests()
GROUP BY suite
ORDER BY suite;

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
--   DROP VIEW IF EXISTS public.vw_tickets_v2_test_health;
--   DROP FUNCTION IF EXISTS public.tickets_v2_run_all_tests();
--   DROP FUNCTION IF EXISTS public._test_tickets_v2_compute_function();
--   DROP FUNCTION IF EXISTS public._test_tickets_v2_trigger_log_only();
--   DROP FUNCTION IF EXISTS public._test_tickets_v2_invariants();
-- COMMIT;
