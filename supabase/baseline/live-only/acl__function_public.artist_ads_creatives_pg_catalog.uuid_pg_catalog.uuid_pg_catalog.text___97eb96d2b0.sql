-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.artist_ads_creatives(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "42d80ba8078e02bedb2f4473cc5a621f277b301fcfe75318c2edab50a0f005f8", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION a7399f7a32722de9bca4079874b4d338eabc8cc922d1216b745ab11e9241c902
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.artist_ads_creatives(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text) FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.artist_ads_creatives(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text) FROM "anon";
RESET ROLE;
-- END OPERATION a7399f7a32722de9bca4079874b4d338eabc8cc922d1216b745ab11e9241c902
