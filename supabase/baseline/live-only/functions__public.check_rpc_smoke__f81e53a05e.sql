-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.check_rpc_smoke()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "8778c45325854fb6410c6206d7965b8949bfea877516cb1ef0ddd43b2f796cec", "live_properties_sha256": "213cf3ef7063d3f2053cf871b524d3f218c957165aa6966075c4d2213aeb6092", "oid": 188262, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "9df69799f6912074a9e806929e03471a733ff69a93bc6a9ceae588b2f2476fe1", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 455bea6ca1e7cc690ad5efbdcadd469e9a315392a01d02ddfca4fe9511ab5436
CREATE OR REPLACE FUNCTION public.check_rpc_smoke()
 RETURNS TABLE(code text, ok boolean, error text, checked_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

ALTER FUNCTION public.check_rpc_smoke() OWNER TO "postgres";
-- END OPERATION 455bea6ca1e7cc690ad5efbdcadd469e9a315392a01d02ddfca4fe9511ab5436
