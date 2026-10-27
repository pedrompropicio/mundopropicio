-- #352 G3: local disposable replay only. Never apply to Live.
-- object: tables:public.bkp_359_whatsapp_legado_coala
-- stage: reconcile
-- provenance: {"live_absence": false, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "2591a131777674445812f202925c40d3af7ee4acb7a275ea6861da27c74cdb80", "oid": 659700, "oid_catalog_query_sha256": "f76c9fbe999494c50d25221281e0accb7508e5b83e3f2752b06fb18ba25837f0", "oid_observation_scope": "catalogue identifier only; frozen definition/property hash remains separately dated", "oid_observed_at_utc": "2026-10-27 20:10:13.900178+00", "review": 6445145238, "rule": "live_only_tail", "source_sql_sha256": "9667d288e680f3614e07f28830d568b9158b177e6169c7e7b1cff9fa900db63f", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 6fea69f47d2a0726176cf2934a04ef60d7ceb2b4576849bed4d2cf13364efac6
CREATE TABLE IF NOT EXISTS public.bkp_359_whatsapp_legado_coala (
 "id" uuid,
 "company_id" uuid,
 "consent_whatsapp" boolean,
 "consent_whatsapp_at" timestamp with time zone,
 "consent_whatsapp_source" text,
 "saved_at" timestamp with time zone
);

ALTER TABLE public.bkp_359_whatsapp_legado_coala OWNER TO "postgres";

ALTER TABLE public.bkp_359_whatsapp_legado_coala ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bkp_359_whatsapp_legado_coala NO FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bkp_359_whatsapp_legado_coala FROM PUBLIC;

REVOKE ALL ON TABLE public.bkp_359_whatsapp_legado_coala FROM "anon";

REVOKE ALL ON TABLE public.bkp_359_whatsapp_legado_coala FROM "authenticated";

REVOKE ALL ON TABLE public.bkp_359_whatsapp_legado_coala FROM "service_role";

GRANT INSERT ON TABLE public.bkp_359_whatsapp_legado_coala TO "postgres";

GRANT SELECT ON TABLE public.bkp_359_whatsapp_legado_coala TO "postgres";

GRANT UPDATE ON TABLE public.bkp_359_whatsapp_legado_coala TO "postgres";

GRANT DELETE ON TABLE public.bkp_359_whatsapp_legado_coala TO "postgres";

GRANT TRUNCATE ON TABLE public.bkp_359_whatsapp_legado_coala TO "postgres";

GRANT REFERENCES ON TABLE public.bkp_359_whatsapp_legado_coala TO "postgres";

GRANT TRIGGER ON TABLE public.bkp_359_whatsapp_legado_coala TO "postgres";

GRANT MAINTAIN ON TABLE public.bkp_359_whatsapp_legado_coala TO "postgres";

GRANT INSERT ON TABLE public.bkp_359_whatsapp_legado_coala TO "anon";

GRANT SELECT ON TABLE public.bkp_359_whatsapp_legado_coala TO "anon";

GRANT UPDATE ON TABLE public.bkp_359_whatsapp_legado_coala TO "anon";

GRANT DELETE ON TABLE public.bkp_359_whatsapp_legado_coala TO "anon";

GRANT TRUNCATE ON TABLE public.bkp_359_whatsapp_legado_coala TO "anon";

GRANT REFERENCES ON TABLE public.bkp_359_whatsapp_legado_coala TO "anon";

GRANT TRIGGER ON TABLE public.bkp_359_whatsapp_legado_coala TO "anon";

GRANT MAINTAIN ON TABLE public.bkp_359_whatsapp_legado_coala TO "anon";

GRANT INSERT ON TABLE public.bkp_359_whatsapp_legado_coala TO "authenticated";

GRANT SELECT ON TABLE public.bkp_359_whatsapp_legado_coala TO "authenticated";

GRANT UPDATE ON TABLE public.bkp_359_whatsapp_legado_coala TO "authenticated";

GRANT DELETE ON TABLE public.bkp_359_whatsapp_legado_coala TO "authenticated";

GRANT TRUNCATE ON TABLE public.bkp_359_whatsapp_legado_coala TO "authenticated";

GRANT REFERENCES ON TABLE public.bkp_359_whatsapp_legado_coala TO "authenticated";

GRANT TRIGGER ON TABLE public.bkp_359_whatsapp_legado_coala TO "authenticated";

GRANT MAINTAIN ON TABLE public.bkp_359_whatsapp_legado_coala TO "authenticated";

GRANT INSERT ON TABLE public.bkp_359_whatsapp_legado_coala TO "service_role";

GRANT SELECT ON TABLE public.bkp_359_whatsapp_legado_coala TO "service_role";

GRANT UPDATE ON TABLE public.bkp_359_whatsapp_legado_coala TO "service_role";

GRANT DELETE ON TABLE public.bkp_359_whatsapp_legado_coala TO "service_role";

GRANT TRUNCATE ON TABLE public.bkp_359_whatsapp_legado_coala TO "service_role";

GRANT REFERENCES ON TABLE public.bkp_359_whatsapp_legado_coala TO "service_role";

GRANT TRIGGER ON TABLE public.bkp_359_whatsapp_legado_coala TO "service_role";

GRANT MAINTAIN ON TABLE public.bkp_359_whatsapp_legado_coala TO "service_role";
-- END OPERATION 6fea69f47d2a0726176cf2934a04ef60d7ceb2b4576849bed4d2cf13364efac6
