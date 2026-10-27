-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:relation:public.v_song_content
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "b70074841f18abda6881237de50ba288f5a7f44540977aa4608cda406a205dc0", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION b0fc6bbc18e6f175de216ff26b17a8e3774728e163dc8b8f7f2a02a71d125749
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON TABLE public.v_song_content FROM "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT MAINTAIN ON TABLE public.v_song_content TO "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT REFERENCES ON TABLE public.v_song_content TO "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT TRIGGER ON TABLE public.v_song_content TO "anon";
RESET ROLE;
-- END OPERATION b0fc6bbc18e6f175de216ff26b17a8e3774728e163dc8b8f7f2a02a71d125749
