-- #677 · R2 PREPARADA, NÃO APLICADA. Apenas SELECT; executar pelo 0 na janela.
-- Parâmetros externos (psql): company_id = UUID da empresa; month = primeiro dia do mês.
-- Sem valores reais neste ficheiro. Exemplo de forma do parâmetro: YYYY-MM-01.
-- Antes do lote 01 confirmar saldos de abertura em 31/12/2025 (ponto 8, fora desta entrega).
-- Comparar CADA par agência+conta com «Posição de saldo das contas» no sistema actual,
-- em BRL e no mesmo último dia do mês. A função inclui os movimentos anteriores ao lote.
-- Verificar também completude: todas as contas do de-para devem constar do mapa.
-- Qualquer diferença, conta ausente, saldo NULL ou ausência de linhas: PARAR.
-- Se não bater, pedir «Corro?» para import_sm_2026_rollback_batch(batch_id) e guardar a saída.
-- Não avançar para o mês seguinte antes de fechar este corte.
SELECT financial_account_id, agency, account, balance,
  (:'month'::date + interval '1 month' - interval '1 day')::date AS corte
FROM public.import_sm_2026_batch_close(:'company_id'::uuid, :'month'::date)
ORDER BY agency, account;

SELECT batch_id, batch_month, status, rows, applied_at, rolled_back_at
FROM public.import_sm_2026_batches
WHERE company_id = :'company_id'::uuid AND batch_month = :'month'::date
ORDER BY applied_at;
