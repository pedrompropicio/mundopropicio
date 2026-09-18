-- Ensaios (scope='restore_test') podem ocorrer várias vezes por dia: a unicidade
-- diária só faz sentido para backups reais.
DROP INDEX IF EXISTS public.backup_runs_ok_unico_por_dia_alvo;
CREATE UNIQUE INDEX backup_runs_ok_unico_por_dia_alvo
  ON public.backup_runs (run_date, scope, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE (status = 'ok' AND scope <> 'restore_test');