-- ============================================================================
-- ⚠️ NÃO CORRER VIA `query_database` DIRECTO
-- ============================================================================
-- Este ficheiro é a referência canónica do que precisa entrar na base, MAS o
-- caminho de execução correcto é:
--
-- 1. Pedir ao agente Lovable: «cria migration em supabase/migrations/ com o
--    conteúdo de scripts/fase-tickets-v2-live/04-activate-coala.sql e aplica
--    em Test».
-- 2. Agente aplica em Test e regista a migration no repo.
-- 3. Republicar (Publish). O pipeline aplica a migration em Live.
--
-- Razão: SQL via query_database bate apenas em Live, Test fica em drift, o
-- publish é recusado. Ver .lovable/memory/features/tickets-v2-migration.md
-- (secção «Constraint crítico: Test ↔ Live»).
--
-- Pre-flight (antes de criar a migration):
--   Pedir ao agente: «Verifica drift Test↔Live para tickets v2 (objectos
--   listados no memory file). Reporta diferenças, não corrijas ainda.»
--   Se houver drift, resolver primeiro antes deste batch.
--
-- Pre-flight adicional para este batch:
--   Confirmar que `tickets_config -> 'sync_mode'` da Coala está `'log_only'`
--   em AMBAS bases (Test e Live) antes de aplicar. Se Test e Live divergem
--   na configuração, alinhar primeiro.
-- ============================================================================

-- ============================================================================
-- FASE TICKETS V2 — BATCH 04: ACTIVAR COALA EM MODO ACTIVE
-- ============================================================================
-- Pré-requisitos:
--   - Batch 03 (handler atualizado para active mode) executado.
--   - Suite SQL `tickets_v2_run_all_tests()` a passar 33/33.
--   - Logs do trigger em log-only (últimos 7 dias) revistos:
--       - SELECT * FROM vw_tickets_v2_sync_summary_7d;
--       - SELECT * FROM vw_tickets_v2_sync_warnings;
--       - SELECT * FROM vw_tickets_v2_sync_would_create;
--   - Nenhum warning inesperado, nenhum `would_create_type` com nome estranho.
--
-- O que muda neste batch:
--   - Apenas a Coala Festival Portugal passa para active mode.
--   - A partir daqui, qualquer save em event_ticket_lots dessa empresa:
--       * Sem ticket_type_id → o trigger preenche automaticamente
--           (linka tipo existente OU cria tipo + junction)
--       * Com ticket_type_id explícito → respeita
--   - Mundo Propício continua em log-only (sem mudança).
--
-- Janela de observação recomendada após este batch:
--   - 24h mínimas antes de activar Mundo Propício (Batch 05).
--   - Acompanhar `vw_tickets_v2_sync_summary_7d` para confirmar que
--     `linked_existing` e `created_type` (se aplicável) aparecem em vez
--     dos seus equivalentes `would_*`.
--
-- Risco residual: BAIXO.
--   - Coala 2026 não tem tráfego de venda activa pelo sistema (controlado
--     externamente via Sheet) — confirmado pelo gestor.
--   - Coala históricos (2024, 2025) estão em estado completed; mudanças neles
--     são raras e ficam todas auditadas via tickets_v2_sync_log.
--
-- Rollback: comentado no fim, devolve Coala para log-only.
-- ============================================================================

BEGIN;

-- ─── 1) Pre-flight: confirmar que o handler está atualizado ────────────────
DO $$
DECLARE
  v_func_def text;
BEGIN
  SELECT pg_get_functiondef('public.tickets_v2_sync_lot'::regproc) INTO v_func_def;

  IF v_func_def NOT LIKE '%linked_existing%' OR v_func_def NOT LIKE '%created_type%' THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAILED: handler não está atualizado para active mode. Correr batch 03 primeiro.';
  END IF;

  RAISE NOTICE 'PRE-FLIGHT OK — handler suporta active mode.';
END $$;

-- ─── 2) Pre-flight: testes SQL passam ───────────────────────────────────────
DO $$
DECLARE
  v_failed int;
BEGIN
  SELECT count(*) INTO v_failed
  FROM public.tickets_v2_run_all_tests()
  WHERE NOT passed;

  IF v_failed > 0 THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAILED: % testes da suite SQL falharam', v_failed;
  END IF;
END $$;

-- ─── 3) Snapshot do estado actual antes da activação ────────────────────────
DO $$
DECLARE
  v_lots int;
  v_types int;
  v_qty bigint;
BEGIN
  SELECT count(*) INTO v_lots FROM public.event_ticket_lots l
  JOIN public.event_ticket_zones z ON z.id = l.zone_id
  WHERE z.company_id = '7d831e59-6e82-427b-95a0-64904aae5dd2';

  SELECT count(*) INTO v_types FROM public.event_ticket_types
  WHERE company_id = '7d831e59-6e82-427b-95a0-64904aae5dd2';

  SELECT COALESCE(sum(quantity), 0) INTO v_qty FROM public.event_ticket_lots l
  JOIN public.event_ticket_zones z ON z.id = l.zone_id
  WHERE z.company_id = '7d831e59-6e82-427b-95a0-64904aae5dd2';

  RAISE NOTICE 'SNAPSHOT pre-activacao Coala: lots=%, types=%, qty_total=%',
    v_lots, v_types, v_qty;
END $$;

-- ─── 4) Activar Coala em active mode ────────────────────────────────────────
UPDATE public.companies
SET tickets_config = jsonb_set(tickets_config, '{sync_mode}', '"active"', true)
WHERE id = '7d831e59-6e82-427b-95a0-64904aae5dd2';

-- ─── 5) Confirmar ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_mode text;
BEGIN
  SELECT tickets_config -> 'sync_mode' #>> '{}'
  INTO v_mode
  FROM public.companies
  WHERE id = '7d831e59-6e82-427b-95a0-64904aae5dd2';

  IF v_mode <> 'active' THEN
    RAISE EXCEPTION 'ACTIVATION FAILED: sync_mode=% (esperado active)', v_mode;
  END IF;

  RAISE NOTICE 'COALA AGORA EM ACTIVE MODE. Mundo Propicio continua em log-only.';
END $$;

COMMIT;

-- ============================================================================
-- VALIDAÇÃO PÓS-ACTIVAÇÃO (correr manualmente nas próximas horas)
-- ============================================================================
-- a) Estado actual:
--    SELECT display_name, tickets_config -> 'sync_mode' AS mode
--    FROM public.companies ORDER BY display_name;
--
-- b) Logs gerados desde a activação (espera-se: linked_existing dominante):
--    SELECT trigger_action, count(*)
--    FROM public.tickets_v2_sync_log
--    WHERE company_id = '7d831e59-6e82-427b-95a0-64904aae5dd2'
--      AND created_at > now() - interval '1 hour'
--    GROUP BY trigger_action;
--
-- c) Se aparecer `created_type` é BOM (significa que houve um save real
--    com nome novo, e o trigger criou o tipo automaticamente). Verificar
--    o nome para confirmar que faz sentido:
--    SELECT proposed_type_name, count(*)
--    FROM public.tickets_v2_sync_log
--    WHERE company_id = '7d831e59-6e82-427b-95a0-64904aae5dd2'
--      AND trigger_action = 'created_type'
--    GROUP BY proposed_type_name;
--
-- d) Reconciliação contínua — devem continuar a bater:
--    SELECT * FROM public.tickets_v2_run_all_tests() WHERE NOT passed;

-- ============================================================================
-- ROLLBACK (correr para devolver Coala a log-only se necessário)
-- ============================================================================
-- BEGIN;
--   UPDATE public.companies
--   SET tickets_config = jsonb_set(tickets_config, '{sync_mode}', '"log_only"', true)
--   WHERE id = '7d831e59-6e82-427b-95a0-64904aae5dd2';
-- COMMIT;
--
-- IMPORTANTE: este rollback NÃO desfaz tipos criados durante o período
-- active. Os tipos criados pelo trigger ficam (são aditivos). Se quiseres
-- removê-los manualmente, identifica-os pelo log:
--   SELECT proposed_type_id FROM public.tickets_v2_sync_log
--   WHERE company_id = '7d831e59-6e82-427b-95a0-64904aae5dd2'
--     AND trigger_action = 'created_type'
--     AND created_at > '<momento da activação>';
