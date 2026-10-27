-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.artist_ads_promotable_posts(pg_catalog.uuid,pg_catalog.text)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "42d80ba8078e02bedb2f4473cc5a621f277b301fcfe75318c2edab50a0f005f8", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 7d78566558167fc49464e1084f83ab7e38e6013993315b2df09f3b5583a0dbf1
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.artist_ads_promotable_posts(pg_catalog.uuid,pg_catalog.text) FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.artist_ads_promotable_posts(pg_catalog.uuid,pg_catalog.text) FROM "anon";
RESET ROLE;
-- END OPERATION 7d78566558167fc49464e1084f83ab7e38e6013993315b2df09f3b5583a0dbf1
