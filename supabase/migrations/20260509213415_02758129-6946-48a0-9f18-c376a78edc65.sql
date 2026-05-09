CREATE OR REPLACE FUNCTION public._test_tickets_v2_compute_function()
RETURNS TABLE(test_name text, passed boolean, detail text)
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  z_any UUID;
BEGIN
  SELECT id INTO z_any FROM public.event_ticket_zones ORDER BY created_at DESC NULLS LAST LIMIT 1;

  IF z_any IS NULL THEN
    RETURN QUERY SELECT 'T0 sem-zonas:skip'::TEXT, true, 'Sem zonas de bilheteira disponíveis para teste'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'Tag | Nome Sem Lote', z_any, false, NULL, 1, NULL
  );
  RETURN QUERY SELECT
    'regex-sem-sufixo-lote:base-puro'::TEXT,
    (r.base_name = 'Nome Sem Lote'),
    ('base=' || COALESCE(r.base_name, 'null'))::TEXT;

  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'Nome Direto', z_any, false, NULL, 1, NULL
  );
  RETURN QUERY SELECT
    'regex-sem-pipe:base-puro'::TEXT,
    (r.base_name = 'Nome Direto'),
    ('base=' || COALESCE(r.base_name, 'null'))::TEXT;

  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'Tag | Nome Composto - Lote 7', z_any, false, NULL, 1, NULL
  );
  RETURN QUERY SELECT
    'regex-sufixo-lote-maiusculo:remove'::TEXT,
    (r.base_name = 'Nome Composto'),
    ('base=' || COALESCE(r.base_name, 'null'))::TEXT;

  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'Passe Estranho', z_any, true, ARRAY[]::uuid[], 2, NULL
  );
  RETURN QUERY SELECT
    'combo-consumes-vazio:warning'::TEXT,
    ('combo_with_empty_consumes' = ANY(COALESCE(r.warnings, ARRAY[]::text[]))),
    ('warnings=' || COALESCE(array_to_string(r.warnings, ','), ''))::TEXT;

  SELECT * INTO r FROM public.compute_ticket_type_for_lot(
    'Whatever', '00000000-0000-0000-0000-000000000000'::uuid,
    false, NULL, 1, NULL
  );
  RETURN QUERY SELECT
    'zona-inexistente:warning'::TEXT,
    (r.found_type_id IS NULL
     AND r.base_name IS NULL
     AND EXISTS (SELECT 1 FROM unnest(COALESCE(r.warnings, ARRAY[]::text[])) w WHERE w LIKE 'orphan_zone:%')),
    ('warnings=' || COALESCE(array_to_string(r.warnings, ','), ''))::TEXT;
END $$;

CREATE OR REPLACE FUNCTION public._test_tickets_v2_trigger_log_only()
RETURNS TABLE(test_name text, passed boolean, detail text)
LANGUAGE sql
AS $$
  SELECT
    'trigger-exists'::TEXT,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'event_ticket_lots'
        AND t.tgname = 'trg_tickets_v2_sync'
        AND NOT t.tgisinternal
    ) AS passed,
    'Verifica trigger log-only em event_ticket_lots'::TEXT
  UNION ALL
  SELECT
    'sync-log-table-exists'::TEXT,
    to_regclass('public.tickets_v2_sync_log') IS NOT NULL,
    'Verifica tabela de log Tickets V2'::TEXT;
$$;

CREATE OR REPLACE FUNCTION public._test_tickets_v2_invariants()
RETURNS TABLE(test_name text, passed boolean, detail text)
LANGUAGE sql
AS $$
  SELECT
    'tables-exist'::TEXT,
    to_regclass('public.event_ticket_types') IS NOT NULL
      AND to_regclass('public.event_ticket_type_zones') IS NOT NULL
      AND to_regclass('public.tickets_v2_sync_log') IS NOT NULL,
    'Verifica tabelas centrais Tickets V2'::TEXT
  UNION ALL
  SELECT
    'lots-columns-exist'::TEXT,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'event_ticket_lots' AND column_name = 'ticket_type_id'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'event_ticket_lots' AND column_name = 'sales_window_start'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'event_ticket_lots' AND column_name = 'sales_window_end'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'event_ticket_lots' AND column_name = 'campaign_label'
    ),
    'Verifica colunas Tickets V2 em lotes'::TEXT
  UNION ALL
  SELECT
    'company-config-columns-exist'::TEXT,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'feature_tickets_v2'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'tickets_config'
    ),
    'Verifica flags/config Tickets V2 em empresas'::TEXT;
$$;

CREATE OR REPLACE FUNCTION public.tickets_v2_run_all_tests()
RETURNS TABLE(suite text, test_name text, passed boolean, detail text)
LANGUAGE sql
AS $$
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

CREATE OR REPLACE VIEW public.vw_tickets_v2_test_health AS
SELECT suite,
       count(*) AS total,
       count(*) FILTER (WHERE passed) AS passed,
       count(*) FILTER (WHERE NOT passed) AS failed,
       CASE
         WHEN count(*) FILTER (WHERE NOT passed) = 0 THEN '✓ ok'::text
         ELSE '✗ falhas'::text
       END AS status
FROM public.tickets_v2_run_all_tests()
GROUP BY suite
ORDER BY suite;