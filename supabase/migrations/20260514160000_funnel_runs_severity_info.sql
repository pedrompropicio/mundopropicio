-- Funnel Test 360 — adicionar 'info' ao CHECK constraint de severity.
--
-- Razão: path unsupported_provider (Bilheteira não suportada) usa severity='info'
-- para distinguir "ainda não suportado pelo Funnel Test 360" de "implementação
-- cliente partida" (severity='critical'/'warning'/'healthy' continuam para
-- diagnósticos reais).
--
-- Frontend (FunnelTest.tsx severityClass) já trata 'info' → caixa azul.
--
-- Backwards-compatible: rows existentes mantêm o seu severity. CHECK
-- constraint é recriado com superset (4 valores em vez de 3).

ALTER TABLE crm.funnel_test_runs
  DROP CONSTRAINT IF EXISTS funnel_test_runs_severity_check;

ALTER TABLE crm.funnel_test_runs
  ADD CONSTRAINT funnel_test_runs_severity_check
  CHECK (severity = ANY (ARRAY['info'::text, 'healthy'::text, 'warning'::text, 'critical'::text]));
