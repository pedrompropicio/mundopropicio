-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.enqueue_email(pg_catalog.text,pg_catalog.jsonb)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "6d6ce72780e4c7bdad5b5877e0c1800bc45d5aed6472fb56c0fef912670ddc86", "live_properties_sha256": "12743b8f82e977c4111a5796379a23d79a23e8bf89c4419ba81c0676efc7632c", "oid": 21434, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "476936652c63b3d9203464b753b4226dc06b1c56aba98bd34a0a11a033cfd4e3", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 52379213a79dfa29beb35cc9f3bc2c89e51023f32d1b3d820367855427513343
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$
;

ALTER FUNCTION public.enqueue_email(pg_catalog.text,pg_catalog.jsonb) OWNER TO "postgres";
-- END OPERATION 52379213a79dfa29beb35cc9f3bc2c89e51023f32d1b3d820367855427513343
