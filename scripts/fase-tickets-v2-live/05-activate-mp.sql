-- ============================================================================
-- ⚠️ NÃO CORRER VIA `query_database` DIRECTO
-- ============================================================================
-- Este ficheiro é a referência canónica do que precisa entrar na base, MAS o
-- caminho de execução correcto é:
--
-- 1. Pedir ao agente Lovable: «cria migration em supabase/migrations/ com o
--    conteúdo de scripts/fase-tickets-v2-live/05-activate-mp.sql e aplica
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
--   Confirmar que Coala está `'active'` em AMBAS bases (Test e Live) e que
--   Mundo Propício está `'log_only'` em AMBAS. Não executar se houver
--   divergência entre ambientes.
-- ============================================================================

-- ============================================================================
-- FASE TICKETS V2 — BATCH 05: ACTIVAR MUNDO PROPÍCIO EM MODO ACTIVE
-- ============================================================================
-- Pré-requisitos:
--   - Batch 04 (Coala em active) executado.
--   - Coala em active há ≥24h sem incidentes:
--       * `tickets_v2_sync_log` mostra `linked_existing` dominante.
--       * Eventuais `created_type` revistos e aprovados.
--       * Nenhum `would_warn_invalid_type` recente.
--       * `vw_tickets_v2_test_health` continua "✓ ok" para todas as suites.
--
-- O que muda neste batch:
--   - Mundo Propício passa para active mode.
--   - Mundo Propício tem MUITO mais eventos que Coala (10 vs 3) e mais
--     diversidade de padrões (Henry&Klaus sessões, Ivete fases simples,
--     master/split, etc.). Por isso vai DEPOIS de Coala estabilizar.
--
-- Risco residual: BAIXO-MÉDIO.
--   - Mundo Propício tem 264 tipos só (vs 16 do Coala) — mais material
--     para o trigger pode reconhecer ou criar.
--   - Há eventos com vendas activas em produção (Henry&Klaus, Ivete) —
--     SAVES manuais devem continuar a passar sem fricção, dado o desenho
--     da opção C (cria tipo automaticamente em modo legacy).
--
-- Janela de observação: ≥7 dias antes da Fase 4 (single-write).
--
-- Rollback: comentado no fim, devolve Mundo Propício para log-only.
-- ============================================================================

BEGIN;

-- ─── 1) Pre-flight: confirmar que Coala está em active e estável ───────────
DO $$
DECLARE
  v_coala_mode text;
  v_recent_warnings int;
BEGIN
  SELECT tickets_config -> 'sync_mode' #>> '{}'
  INTO v_coala_mode
  FROM public.companies
  WHERE id = '7d831e59-6e82-427b-95a0-64904aae5dd2';

  IF v_coala_mode <> 'active' THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAILED: Coala não está em active mode (mode=%). Correr batch 04 primeiro.', v_coala_mode;
  END IF;

  -- Não pode haver warnings inválidos dos últimos 7 dias
  SELECT count(*) INTO v_recent_warnings
  FROM public.tickets_v2_sync_log
  WHERE trigger_action = 'would_warn_invalid_type'
    AND created_at > now() - interval '7 days';

  IF v_recent_warnings > 0 THEN
    RAISE WARNING 'AVISO: % entradas would_warn_invalid_type nos ultimos 7 dias. Rever antes de prosseguir.', v_recent_warnings;
  END IF;

  RAISE NOTICE 'PRE-FLIGHT OK — Coala em active, sem warnings invalidos recentes.';
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

-- ─── 3) Snapshot Mundo Propício pre-activacao ──────────────────────────────
DO $$
DECLARE
  v_lots int;
  v_types int;
  v_qty bigint;
BEGIN
  SELECT count(*) INTO v_lots FROM public.event_ticket_lots l
  JOIN public.event_ticket_zones z ON z.id = l.zone_id
  WHERE z.company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';

  SELECT count(*) INTO v_types FROM public.event_ticket_types
  WHERE company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';

  SELECT COALESCE(sum(quantity), 0) INTO v_qty FROM public.event_ticket_lots l
  JOIN public.event_ticket_zones z ON z.id = l.zone_id
  WHERE z.company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';

  RAISE NOTICE 'SNAPSHOT pre-activacao Mundo Propicio: lots=%, types=%, qty_total=%',
    v_lots, v_types, v_qty;
END $$;

-- ─── 4) Activar Mundo Propício ──────────────────────────────────────────────
UPDATE public.companies
SET tickets_config = jsonb_set(tickets_config, '{sync_mode}', '"active"', true)
WHERE id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';

-- ─── 5) Confirmar ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_mode text;
BEGIN
  SELECT tickets_config -> 'sync_mode' #>> '{}'
  INTO v_mode
  FROM public.companies
  WHERE id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';

  IF v_mode <> 'active' THEN
    RAISE EXCEPTION 'ACTIVATION FAILED: sync_mode=% (esperado active)', v_mode;
  END IF;

  RAISE NOTICE 'MUNDO PROPICIO AGORA EM ACTIVE MODE. Coala continua active. Sistema todo em active.';
END $$;

COMMIT;

-- ============================================================================
-- VALIDAÇÃO PÓS-ACTIVAÇÃO
-- ============================================================================
-- a) Estado actual de ambas as empresas:
--    SELECT display_name, tickets_config -> 'sync_mode' AS mode, feature_tickets_v2
--    FROM public.companies ORDER BY display_name;
--
-- b) Distribuição de actions desde a activação:
--    SELECT empresa, trigger_action, qtd
--    FROM public.vw_tickets_v2_sync_summary_7d
--    ORDER BY empresa, qtd DESC;
--
-- c) Tipos criados automaticamente pelo trigger (rever cada um):
--    SELECT
--      e.name AS evento,
--      tt.name AS tipo,
--      tt.created_at,
--      (SELECT count(*) FROM public.event_ticket_lots WHERE ticket_type_id = tt.id) AS lots
--    FROM public.event_ticket_types tt
--    JOIN public.events e ON e.id = tt.event_id
--    WHERE tt.created_at > '<momento da activação Mundo Propicio>'
--    ORDER BY tt.created_at DESC;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
--   UPDATE public.companies
--   SET tickets_config = jsonb_set(tickets_config, '{sync_mode}', '"log_only"', true)
--   WHERE id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
-- COMMIT;
