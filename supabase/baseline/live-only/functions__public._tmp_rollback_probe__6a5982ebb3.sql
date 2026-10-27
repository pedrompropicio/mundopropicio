-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public._tmp_rollback_probe()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "221db696d6833b2133a9f9fea16d729e2921dac03c97092ec1389ae411d800a7", "live_properties_sha256": "792cba6d02635dad0b482083adb0860ebc6d96b263b36a4bbea9873293b344d6", "oid": 236058, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "9618b9b93d831f5eb53c216cfaf47bd7daccde59189b809dd971c25bdb8e4dea", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION d1fa7db93dd58a90b3c838d6497884c22af4726552b79c655487f6abf1347f9b
CREATE OR REPLACE FUNCTION public._tmp_rollback_probe()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare v jsonb; ctx text;
begin
  begin
    update restore_shadow.public__transactions set currency='XXX' where id=(select id from restore_shadow.public__transactions limit 1);
    update restore_shadow.public__events set name = name || ' CORROMPIDO';
    select public.restore_apply_from_shadow('rows','7c858982-6ccd-47ca-bd65-e0dd3eebf01c',
      array['events','bp_versions','bp_version_audit_log','event_cache_configs','event_cache_deductions','event_simulator_config','transactions','payment_list_items','transaction_payments','transaction_documents','transaction_audit_log','event_forecasts','bank_statement_lines','shared_cost_mirror','partner_aporte_mirror','event_forecast_formalidade_log','forecast_audit_log'],'{}'::jsonb) into v;
    raise exception 'PROBE_OK %', v::text;
  exception when others then
    if sqlerrm like 'PROBE_OK%' then return sqlerrm; end if;
    get stacked diagnostics ctx = PG_EXCEPTION_CONTEXT;
    return 'ERRO ' || sqlstate || ' :: ' || sqlerrm;
  end;
end $function$
;

ALTER FUNCTION public._tmp_rollback_probe() OWNER TO "postgres";
-- END OPERATION d1fa7db93dd58a90b3c838d6497884c22af4726552b79c655487f6abf1347f9b
