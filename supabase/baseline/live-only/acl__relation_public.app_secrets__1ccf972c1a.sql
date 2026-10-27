-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:relation:public.app_secrets
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "293b349e7ad6dd2675e9c5375f6d7a982856bc254c2298ff2fdfc0491c7b4fbf", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 201c912f9974abb609c2a0d1c4dfb3bd8fef21b487e7cdc7f492fa740ac62ef2
SET LOCAL ROLE "postgres";
GRANT DELETE ON TABLE public.app_secrets TO "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT INSERT ON TABLE public.app_secrets TO "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT MAINTAIN ON TABLE public.app_secrets TO "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT REFERENCES ON TABLE public.app_secrets TO "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT SELECT ON TABLE public.app_secrets TO "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT TRIGGER ON TABLE public.app_secrets TO "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT TRUNCATE ON TABLE public.app_secrets TO "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT UPDATE ON TABLE public.app_secrets TO "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT DELETE ON TABLE public.app_secrets TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT INSERT ON TABLE public.app_secrets TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT MAINTAIN ON TABLE public.app_secrets TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT REFERENCES ON TABLE public.app_secrets TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT SELECT ON TABLE public.app_secrets TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT TRIGGER ON TABLE public.app_secrets TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT TRUNCATE ON TABLE public.app_secrets TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT UPDATE ON TABLE public.app_secrets TO "authenticated";
RESET ROLE;
-- END OPERATION 201c912f9974abb609c2a0d1c4dfb3bd8fef21b487e7cdc7f492fa740ac62ef2
