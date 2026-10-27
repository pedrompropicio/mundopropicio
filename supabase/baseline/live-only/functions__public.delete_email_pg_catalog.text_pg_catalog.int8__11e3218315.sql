-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.delete_email(pg_catalog.text,pg_catalog.int8)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "dec9be7c2813a3d1b2f18bd38c892950b5bf0afb91f8577b2bdc272efd9544f4", "live_properties_sha256": "0fd276407fe6b75eb34b58d491fb234fb1d4740c7cda681008eef9859aebdb67", "oid": 21433, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "475eff83e23049c0719b8c5f3924da71127e74ed6f596e4f6616534cf1ff865e", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION aab19611c7c0cdfc7c785d4019d2bb1a125db9925c572339c0a9ef814dff5448
CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$
;

ALTER FUNCTION public.delete_email(pg_catalog.text,pg_catalog.int8) OWNER TO "postgres";
-- END OPERATION aab19611c7c0cdfc7c785d4019d2bb1a125db9925c572339c0a9ef814dff5448
