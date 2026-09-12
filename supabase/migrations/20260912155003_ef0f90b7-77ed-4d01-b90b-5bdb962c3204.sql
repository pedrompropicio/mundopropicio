CREATE TABLE IF NOT EXISTS public.sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- pode ser NULL: uma execução de cron cobre várias empresas
  company_id uuid NULL,
  function_name text NOT NULL,
  artist_id uuid NULL REFERENCES public.artists(id) ON DELETE SET NULL,
  trigger_source text NOT NULL CHECK (trigger_source IN ('cron','manual','api')),
  dry_run boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int,
  -- success: gravou >=1 linha e sem erros
  -- partial: gravou algo mas houve erros nalguma plataforma/artista
  -- no_data: correu sem erro mas NAO gravou nada (fonte não respondeu, 0 pontos) — NÃO é sucesso
  -- error: falhou antes de gravar
  status text NOT NULL CHECK (status IN ('running','success','partial','no_data','error')),
  api_calls int NOT NULL DEFAULT 0,
  rows_written int NOT NULL DEFAULT 0,
  -- resumo JSON da execução; NUNCA tokens, chaves ou credenciais
  details jsonb,
  error_text text,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.sync_runs IS 'Registo técnico de execuções de sincronização. status: success=gravou >=1 linha sem erros; partial=gravou algo com erros; no_data=sem erro mas nada gravado (não é sucesso); error=falhou antes de gravar. details nunca contém tokens/chaves/credenciais.';

CREATE INDEX IF NOT EXISTS idx_sync_runs_function_started ON public.sync_runs (function_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_artist_started ON public.sync_runs (artist_id, started_at DESC);

GRANT SELECT ON public.sync_runs TO authenticated;
GRANT ALL ON public.sync_runs TO service_role;

ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

-- Registo técnico sem dados de negócio: leitura a qualquer sessão autenticada
-- (company_id pode ser NULL quando a execução cobre várias empresas).
CREATE POLICY sync_runs_select_authenticated
ON public.sync_runs FOR SELECT TO authenticated USING (true);

-- Escrita exclusiva do sistema (edge functions com service_role).
CREATE POLICY sync_runs_service_write
ON public.sync_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE VIEW public.v_sync_health
WITH (security_invoker = true) AS
WITH last_run AS (
  -- última execução por função (por started_at)
  SELECT DISTINCT ON (function_name)
    function_name, status, started_at, finished_at, duration_ms, api_calls, rows_written, dry_run
  FROM public.sync_runs
  ORDER BY function_name, started_at DESC
),
month_calls AS (
  -- total de chamadas à fonte externa no mês corrente
  SELECT function_name, sum(api_calls)::bigint AS api_calls_month
  FROM public.sync_runs
  WHERE started_at >= date_trunc('month', now())
  GROUP BY function_name
)
SELECT
  l.function_name,
  l.status AS last_status,
  l.started_at AS last_started_at,
  l.finished_at AS last_finished_at,
  l.duration_ms AS last_duration_ms,
  l.api_calls AS last_api_calls,
  l.rows_written AS last_rows_written,
  l.dry_run AS last_dry_run,
  COALESCE(m.api_calls_month, 0) AS api_calls_month
FROM last_run l
LEFT JOIN month_calls m ON m.function_name = l.function_name;

GRANT SELECT ON public.v_sync_health TO authenticated, service_role;