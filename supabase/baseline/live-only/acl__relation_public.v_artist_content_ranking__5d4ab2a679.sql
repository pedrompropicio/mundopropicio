-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:relation:public.v_artist_content_ranking
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "b70074841f18abda6881237de50ba288f5a7f44540977aa4608cda406a205dc0", "oid": 218973, "oid_catalog_query_sha256": "f76c9fbe999494c50d25221281e0accb7508e5b83e3f2752b06fb18ba25837f0", "oid_observation_scope": "catalogue identifier only; frozen definition/property hash remains separately dated", "oid_observed_at_utc": "2026-10-27 20:10:13.900178+00", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 3787fcc305fa190fff194eee0997f686f0779cfa19e4314b4f86b88091bd54c9
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON TABLE public.v_artist_content_ranking FROM "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT MAINTAIN ON TABLE public.v_artist_content_ranking TO "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT REFERENCES ON TABLE public.v_artist_content_ranking TO "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT TRIGGER ON TABLE public.v_artist_content_ranking TO "anon";
RESET ROLE;
-- END OPERATION 3787fcc305fa190fff194eee0997f686f0779cfa19e4314b4f86b88091bd54c9
