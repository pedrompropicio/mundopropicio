-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public._club332_city_profile()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "2eeeec7f3b10938eda31c8510af35f152f584dc34289d5c248a639f583f5c613", "live_properties_sha256": "c01a42941e5a9b33546ad933ab41a3f148223fcd2fdcc6278d0edc8d2201cbdb", "oid": 517984, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "b008c248f5e106adaea73428f90474f306337294a10ed3f9adb377d47f4d5550", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 5104ee6676b078bdee9b52a7b5099a98cb557eea3aeccf32b0fb373e29280be8
CREATE OR REPLACE FUNCTION public._club332_city_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
 IF TG_OP='UPDATE' AND NEW.city IS NOT DISTINCT FROM OLD.city AND NEW.residence_country IS NOT DISTINCT FROM OLD.residence_country THEN RETURN NEW; END IF;
 IF NEW.residence_country IS NULL AND NEW.city IS NULL THEN RETURN NEW; END IF;
 NEW.city:=public.club_city_normalize(NEW.residence_country,NEW.city);
 RETURN NEW;
END $function$
;

ALTER FUNCTION public._club332_city_profile() OWNER TO "postgres";
-- END OPERATION 5104ee6676b078bdee9b52a7b5099a98cb557eea3aeccf32b0fb373e29280be8
