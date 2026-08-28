CREATE OR REPLACE FUNCTION public.check_system_invariants()
RETURNS TABLE (
  code text,
  severity text,
  title text,
  offenders bigint,
  sample jsonb,
  checked_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_company uuid;
  v_now timestamptz := now();
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'check_system_invariants: apenas admin ou manager';
  END IF;

  v_company := public.current_company_id();

  -- REGRA DE ADMISSÃO DE NOVOS INVARIANTES
  -- Só entra neste verificador o que distinga com fiabilidade uma violação de um
  -- caso legítimo do negócio. Sinais heurísticos não entram como 'error': um
  -- verificador que nunca chega a zero deixa de ser lido e destrói a confiança
  -- nos restantes — exatamente o problema que este verificador existe para resolver.

  -- 1. BP_DESPESA_EM_L2 -------------------------------------------------
  RETURN QUERY
  WITH lvl AS (
    SELECT c.id,
           CASE WHEN c.parent_id IS NULL THEN 1
                WHEN p.parent_id IS NULL THEN 2
                ELSE 3 END AS lv,
           c.code, c.name
    FROM public.account_categories c
    LEFT JOIN public.account_categories p ON p.id = c.parent_id
  ),
  bad AS (
    SELECT f.id, f.event_id, f.description, f.amount, lvl.code AS cat_code, lvl.name AS cat_name, lvl.lv
    FROM public.event_forecasts f
    JOIN lvl ON lvl.id = f.category_id
    WHERE f.version_id IS NULL
      AND f.type = 'expense'
      AND lvl.lv <> 3
      AND f.company_id = v_company
  )
  SELECT 'BP_DESPESA_EM_L2', 'error',
         'Linha de BP de despesa numa rubrica que não é de nível 3',
         (SELECT count(*) FROM bad),
         COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM bad LIMIT 5) s), '[]'::jsonb),
         v_now;

  -- 2. TX_EVENTO_SEM_RUBRICA --------------------------------------------
  RETURN QUERY
  WITH bad AS (
    SELECT t.id, t.event_id, t.description, t.amount, t.date
    FROM public.transactions t
    WHERE t.event_id IS NOT NULL
      AND t.category_id IS NULL
      AND t.company_id = v_company
  )
  SELECT 'TX_EVENTO_SEM_RUBRICA', 'warn',
         'Transação com evento mas sem rubrica',
         (SELECT count(*) FROM bad),
         COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM bad LIMIT 5) s), '[]'::jsonb),
         v_now;

  -- 3. VINCULO_CROSS_EVENTO ---------------------------------------------
  -- Nota: transações sem evento (event_id NULL) são legítimas no matching
  -- (SSoT bp-tx-matching aceita event_id NULL) e não contam aqui.
  RETURN QUERY
  WITH bad AS (
    SELECT t.id AS transaction_id, f.id AS forecast_id, t.event_id AS tx_event_id,
           f.event_id AS forecast_event_id, 'forecast_id' AS via
    FROM public.transactions t
    JOIN public.event_forecasts f ON f.id = t.forecast_id
    WHERE t.event_id IS NOT NULL
      AND t.event_id <> f.event_id
      AND t.company_id = v_company
      AND f.company_id = v_company
    UNION ALL
    SELECT t.id, f.id, t.event_id, f.event_id, 'anchor'
    FROM public.event_forecasts f
    JOIN public.transactions t ON t.id = f.transaction_id
    WHERE f.version_id IS NULL
      AND t.event_id IS NOT NULL
      AND t.event_id <> f.event_id
      AND t.company_id = v_company
      AND f.company_id = v_company
  )
  SELECT 'VINCULO_CROSS_EVENTO', 'error',
         'Vínculo BP ↔ transação entre eventos diferentes',
         (SELECT count(*) FROM bad),
         COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM bad LIMIT 5) s), '[]'::jsonb),
         v_now;

  -- 4. VINCULO_DESSINCRONIZADO ------------------------------------------
  RETURN QUERY
  WITH bad AS (
    SELECT f.id AS forecast_id, f.event_id, f.description,
           t.id AS anchor_transaction_id, t.forecast_id AS tx_forecast_id
    FROM public.event_forecasts f
    JOIN public.transactions t ON t.id = f.transaction_id
    WHERE f.version_id IS NULL
      AND t.forecast_id IS DISTINCT FROM f.id
      AND f.company_id = v_company
      AND t.company_id = v_company
  )
  SELECT 'VINCULO_DESSINCRONIZADO', 'error',
         'Escrita dupla fora de sincronia (âncora sem back-link)',
         (SELECT count(*) FROM bad),
         COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM bad LIMIT 5) s), '[]'::jsonb),
         v_now;

  -- 5. BP_LINHAS_DUPLICADAS — REMOVIDO por decisão de 28/08/2026.
  -- Existiu um invariante com este código que marcava como 'error' linhas de BP
  -- com o mesmo event_id, type, category_id, description e amount. O dono do
  -- sistema confirmou que isso NÃO é sinal de defeito: no negócio dele a
  -- repetição exata é estruturalmente normal — parcelamentos (a mesma despesa
  -- dividida em prestações iguais) e valores recorrentes de mensalidades. Por
  -- isso nunca chegaria a zero. NÃO deve ser reintroduzido sem um sinal que
  -- distinga com fiabilidade repetição legítima de duplicação acidental; o
  -- intervalo de criação em milissegundos NÃO serve (uma importação legítima
  -- também cria linhas iguais em milissegundos). O duplo insert por dois
  -- handlers de Enter empilhados no EventForecast.tsx, que motivou a suspeita,
  -- já foi corrigido na origem (remoção dos handlers + latch síncrono
  -- savingRef) e não precisa de vigia.

  -- 6. FORECAST_ID_ORFAO ------------------------------------------------
  RETURN QUERY
  WITH bad AS (
    SELECT t.id AS transaction_id, t.forecast_id, t.event_id, t.description
    FROM public.transactions t
    WHERE t.forecast_id IS NOT NULL
      AND t.company_id = v_company
      AND NOT EXISTS (SELECT 1 FROM public.event_forecasts f WHERE f.id = t.forecast_id)
  )
  SELECT 'FORECAST_ID_ORFAO', 'error',
         'transactions.forecast_id aponta para linha de BP inexistente',
         (SELECT count(*) FROM bad),
         COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM bad LIMIT 5) s), '[]'::jsonb),
         v_now;

  -- 7. TRIGGER_DOCUMENTADO_SEM_LIGACAO ---------------------------------
  RETURN QUERY
  WITH bad AS (
    SELECT p.proname AS function_name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype = 'trigger'::regtype
      AND NOT EXISTS (
        SELECT 1 FROM pg_trigger tg
        WHERE tg.tgfoid = p.oid AND NOT tg.tgisinternal
      )
    ORDER BY p.proname
  )
  SELECT 'TRIGGER_DOCUMENTADO_SEM_LIGACAO', 'warn',
         'Função de trigger sem nenhum trigger associado',
         (SELECT count(*) FROM bad),
         COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM bad LIMIT 5) s), '[]'::jsonb),
         v_now;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.check_system_invariants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_system_invariants() TO authenticated;