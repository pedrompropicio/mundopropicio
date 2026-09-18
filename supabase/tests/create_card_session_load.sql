-- Prova do caminho feliz de create_card_session_load SEM utilizador autenticado
-- (SQL direto). Garante que company_id deixou de depender do contexto do caller
-- e vem sempre de card_sessions.company_id (issue #201, correção 18/09/2026).
-- Corre em Live: tudo dentro de BEGIN … ROLLBACK, não escreve nada.

BEGIN;

-- Sessão de cartão aberta qualquer (não escrevemos nada nela — só lemos o id).
DO $$
DECLARE
  v_session_id uuid;
  v_company_id uuid;
  v_src uuid;
  v_out uuid;
  v_load record;
BEGIN
  SELECT id, company_id INTO v_session_id, v_company_id
    FROM public.card_sessions
   WHERE status <> 'closed' AND company_id IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_session_id IS NULL THEN
    RAISE NOTICE 'SKIP: não há sessões de cartão abertas — nada a provar.';
    RETURN;
  END IF;

  -- Conta de origem qualquer da mesma empresa.
  SELECT id INTO v_src
    FROM public.financial_accounts
   WHERE company_id = v_company_id
   ORDER BY created_at
   LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'Sem conta financeira na empresa da sessão — prova impossível.';
  END IF;

  -- Chamada sem auth.uid() (SQL direto): tem de passar à mesma.
  v_out := public.create_card_session_load(v_session_id, 1.00, CURRENT_DATE, v_src, 'teste prova #201');

  SELECT * INTO v_load FROM public.card_session_loads WHERE out_transaction_id = v_out;

  IF v_load.company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'FALHOU: card_session_loads.company_id (%) != sessão (%)', v_load.company_id, v_company_id;
  END IF;

  IF (SELECT company_id FROM public.transactions WHERE id = v_out) IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'FALHOU: transactions.company_id diverge da empresa da sessão.';
  END IF;

  IF (SELECT status FROM public.transactions WHERE id = v_out) <> 'pending' THEN
    RAISE EXCEPTION 'FALHOU: saída não nasceu pending.';
  END IF;

  IF v_load.in_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: entrada não devia existir antes da liquidação.';
  END IF;

  RAISE NOTICE 'OK: carga criada sem contexto de auth, empresa da sessão (%) escrita nas duas pernas.', v_company_id;
END $$;

ROLLBACK;
