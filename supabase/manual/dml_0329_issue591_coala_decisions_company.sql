-- #591 / 0329 — DML PREPARADO, NÃO APLICADO; separado da migração.
-- Autorização de preparação: 6618640384; decisão 6634415741 (04/11/2026).
-- Aplicação só pelo 0 com «Corro?», depois da 0329 PARTE 1 (§0b), antes da PARTE 2.
-- §A: medir e guardar grupos e total; preencher v_expected_count com esse total.
-- Não calcular automaticamente a expectativa dentro do DO: ela é a contagem aprovada.
-- NULL na variável impede execução acidental; se a guarda falhar, não fechar o ramo.
-- Executar §B e §C na mesma transacção da janela, sem escritas concorrentes até à parte 2.
-- O DML não altera decisões já atribuídas nem inventa empresa sem corrida correspondente.

-- §A — NULL por corrida/empresa; corrida ausente fica explícita no LEFT JOIN.
SELECT d.run_id, r.company_id AS empresa_da_corrida, count(*) AS decisoes_null
FROM public.coala_sync_decisions d
LEFT JOIN public.coala_sync_runs r ON r.id = d.run_id
WHERE d.company_id IS NULL
GROUP BY d.run_id, r.company_id
ORDER BY d.run_id, r.company_id;
SELECT count(*) AS total_null_esperado
FROM public.coala_sync_decisions WHERE company_id IS NULL;

-- §B — Substituir apenas o NULL da variável pela contagem de §A aprovada no «Corro?».
DO $backfill$
DECLARE
  v_expected_count bigint := NULL;
  v_actual_count bigint;
  v_updated_count bigint;
BEGIN
  IF v_expected_count IS NULL OR v_expected_count < 0 THEN
    RAISE EXCEPTION '0329: preencher v_expected_count com o total aprovado de §A';
  END IF;
  LOCK TABLE public.coala_sync_decisions IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.coala_sync_runs IN SHARE MODE;
  SELECT count(*) INTO v_actual_count
  FROM public.coala_sync_decisions WHERE company_id IS NULL;
  IF v_actual_count <> v_expected_count THEN
    RAISE EXCEPTION '0329: contagem mudou: esperado %, encontrado %', v_expected_count, v_actual_count;
  END IF;

  UPDATE public.coala_sync_decisions d
  SET company_id = r.company_id
  FROM public.coala_sync_runs r
  WHERE r.id = d.run_id AND d.company_id IS NULL;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> v_expected_count THEN
    RAISE EXCEPTION '0329: preenchimento incompleto: esperado %, actualizado %', v_expected_count, v_updated_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.coala_sync_decisions WHERE company_id IS NULL) THEN
    RAISE EXCEPTION '0329: restam decisões NULL; não executar a parte 2';
  END IF;
END
$backfill$;

-- §C — Esperado: 0; guardar resultado antes de executar a PARTE 2.
SELECT count(*) AS null_restantes_esperado_zero
FROM public.coala_sync_decisions WHERE company_id IS NULL;
