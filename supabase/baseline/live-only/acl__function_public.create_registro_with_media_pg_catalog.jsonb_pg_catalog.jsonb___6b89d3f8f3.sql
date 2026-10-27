-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.create_registro_with_media(pg_catalog.jsonb,pg_catalog.jsonb)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "a32260302883194975dca646a91c9b27e010558dd55d4c1d548679e683bdb721", "oid": 102949, "oid_catalog_query_sha256": "f76c9fbe999494c50d25221281e0accb7508e5b83e3f2752b06fb18ba25837f0", "oid_observation_scope": "catalogue identifier only; frozen definition/property hash remains separately dated", "oid_observed_at_utc": "2026-10-27 20:10:13.900178+00", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 61dba6f2746493d4ab74357c3e69a77df4cafc9fd408d99674b309f0bf15db9a
SET LOCAL ROLE "postgres";
GRANT EXECUTE ON FUNCTION public.create_registro_with_media(pg_catalog.jsonb,pg_catalog.jsonb) TO PUBLIC;
RESET ROLE;
-- END OPERATION 61dba6f2746493d4ab74357c3e69a77df4cafc9fd408d99674b309f0bf15db9a
