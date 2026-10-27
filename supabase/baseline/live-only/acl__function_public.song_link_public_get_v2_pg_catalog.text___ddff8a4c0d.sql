-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.song_link_public_get_v2(pg_catalog.text)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "e2521c346695c48beb7baa5db0729155b113469a350f52b103bad2a25d0dabec", "oid": 353889, "oid_catalog_query_sha256": "f76c9fbe999494c50d25221281e0accb7508e5b83e3f2752b06fb18ba25837f0", "oid_observation_scope": "catalogue identifier only; frozen definition/property hash remains separately dated", "oid_observed_at_utc": "2026-10-27 20:10:13.900178+00", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 9e27826e4bcd552722c663f3f1c4feca9f1dd61faf7086ff09fe569e9d4d1ff0
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.song_link_public_get_v2(pg_catalog.text) FROM PUBLIC;
RESET ROLE;
-- END OPERATION 9e27826e4bcd552722c663f3f1c4feca9f1dd61faf7086ff09fe569e9d4d1ff0
