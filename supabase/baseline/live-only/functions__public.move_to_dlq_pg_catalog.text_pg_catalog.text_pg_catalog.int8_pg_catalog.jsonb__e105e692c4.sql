-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.move_to_dlq(pg_catalog.text,pg_catalog.text,pg_catalog.int8,pg_catalog.jsonb)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "55b6dbfeea9983f0ee8dd651a1a95ad06ff5a09d9fb00351195a0822d8c807da", "live_properties_sha256": "04a4bd63e753f34cd8e07e7ddba30139117e719912af66d27207a31f3293a966", "oid": 21435, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "b58162f3c203b5675c19c26b7f1c989c20be834cf28525419a02ddc91c59f254", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION f76d7f70fe231f317dc4d5c169f32a1cc7e84cbca579c3048484894a0a296d00
CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$
;

ALTER FUNCTION public.move_to_dlq(pg_catalog.text,pg_catalog.text,pg_catalog.int8,pg_catalog.jsonb) OWNER TO "postgres";
-- END OPERATION f76d7f70fe231f317dc4d5c169f32a1cc7e84cbca579c3048484894a0a296d00
