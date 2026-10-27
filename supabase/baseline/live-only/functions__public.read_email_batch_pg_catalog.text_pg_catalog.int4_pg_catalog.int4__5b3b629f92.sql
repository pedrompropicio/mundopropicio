-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.read_email_batch(pg_catalog.text,pg_catalog.int4,pg_catalog.int4)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "938e9d730ae755dfa5429d207e996e5a0559142130af4389eb6da05f1773e6ba", "live_properties_sha256": "57ce83092d29e0c2ef874f670e1f00b4c4b49e029775f66e8a513f8379f7d2e3", "oid": 21436, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "49c110949b88525e74bed77a0567e9dce56b19593c8eb46f98a7640ccec4c036", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 892139dec30dc4764f3d44d31c41d9b80ef666e0312228d1e0534d4352eb65dd
CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$
;

ALTER FUNCTION public.read_email_batch(pg_catalog.text,pg_catalog.int4,pg_catalog.int4) OWNER TO "postgres";
-- END OPERATION 892139dec30dc4764f3d44d31c41d9b80ef666e0312228d1e0534d4352eb65dd
