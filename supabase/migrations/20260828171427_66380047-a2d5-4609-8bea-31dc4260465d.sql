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

  -- 5. BP_LINHAS_DUPLICADAS ---------------------------------------------
  RETURN QUERY
  WITH grp AS (
    SELECT f.event_id, f.type, f.category_id, f.description, f.amount, count(*) AS n
    FROM public.event_forecasts f
    WHERE f.version_id IS NULL
      AND f.company_id = v_company
    GROUP BY 1,2,3,4,5
    HAVING count(*) > 1
  )
  SELECT 'BP_LINHAS_DUPLICADAS', 'warn',
         'Linhas de BP duplicadas (mesmo evento/tipo/rubrica/descrição/valor)',
         COALESCE((SELECT sum(n - 1) FROM grp), 0)::bigint,
         COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM grp LIMIT 5) s), '[]'::jsonb),
         v_now;

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

CREATE OR REPLACE FUNCTION public.check_rpc_smoke()
RETURNS TABLE (
  code text,
  ok boolean,
  error text,
  checked_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_now timestamptz := now();
  v_uuid uuid := gen_random_uuid();
  v_today date := current_date;
  v_sql text;
  v_name text;
  v_names text[] := ARRAY[
    'select count(*) from public.current_company_id()|current_company_id',
    'select count(*) from public.get_sales_position()|get_sales_position',
    'select count(*) from public.get_sales_position_by_provider()|get_sales_position_by_provider',
    'select count(*) from public.get_sales_last_sync()|get_sales_last_sync',
    'select count(*) from public.get_daily_sales_series($1::date, $2::date, null, null)|get_daily_sales_series',
    'select count(*) from public.get_event_bp_changes($3, 30)|get_event_bp_changes',
    'select count(*) from public.list_orphan_transactions_for_event($3)|list_orphan_transactions_for_event',
    'select count(*) from public.list_bp_versions($3)|list_bp_versions',
    'select count(*) from public.bp_version_linked_tx_count($3)|bp_version_linked_tx_count',
    'select count(*) from public.calibrate_forecast_boost($3, 14)|calibrate_forecast_boost',
    'select count(*) from public.get_partner_bp_realized($3)|get_partner_bp_realized',
    'select count(*) from public.get_partner_event_tx_aggregates(array[$3])|get_partner_event_tx_aggregates',
    'select count(*) from public.get_partner_event_partner_expenses(array[$3])|get_partner_event_partner_expenses',
    'select count(*) from public.get_bp_l3_attachments(array[$3])|get_bp_l3_attachments',
    'select count(*) from public.analyze_formalidade_bulk(array[$3])|analyze_formalidade_bulk',
    'select count(*) from public.formalidade_audit_stats(array[$3])|formalidade_audit_stats',
    'select count(*) from public.get_supplier_bank_details(array[$3])|get_supplier_bank_details',
    'select count(*) from public.check_supplier_iban_duplicate(''PT50000000000000000000000'', $3)|check_supplier_iban_duplicate',
    'select count(*) from public.get_leads_geo_stats(''30d'')|get_leads_geo_stats',
    'select count(*) from public.crm_meta_capi_dashboard(7)|crm_meta_capi_dashboard',
    'select count(*) from public.crm_meta_audiences_dashboard()|crm_meta_audiences_dashboard',
    'select count(*) from public.list_endorsable_companies($3)|list_endorsable_companies',
    'select count(*) from public.list_endorsable_events($3, null, null, true, 10)|list_endorsable_events',
    'select count(*) from public.get_event_cash_position($3, $1::date, $2::date)|get_event_cash_position'
  ];
  v_item text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'check_rpc_smoke: apenas admin ou manager';
  END IF;

  FOREACH v_item IN ARRAY v_names LOOP
    v_sql := split_part(v_item, '|', 1);
    v_name := split_part(v_item, '|', 2);
    BEGIN
      EXECUTE v_sql USING v_today, v_today, v_uuid;
      RETURN QUERY SELECT v_name, true, NULL::text, v_now;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_name, false, SQLSTATE || ': ' || SQLERRM, v_now;
    END;
  END LOOP;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.check_rpc_smoke() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rpc_smoke() TO authenticated;