-- #352 G3: local disposable replay only. Never apply to Live.
-- object: tables:public.br_estados
-- stage: historical
-- provenance: {"effective_at": "2026-09-19T11:54:04Z", "live_catalog_sha256": "4d3b671180c7369c53051c3a645672567996c88e2484ea4f4eb5ce629aab0933", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "2591a131777674445812f202925c40d3af7ee4acb7a275ea6861da27c74cdb80", "oid": 240113, "review": "https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6405248457", "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "6b8f20294bf5939e7691cc698b2edb7cd0d5cbed85d5843e606443466cdde1f8", "window": {"effective_at": "2026-09-19T11:54:04Z", "first_reference_version": null, "lower": null, "upper": null}}
-- BEGIN OPERATION c46806298423158893dc86d4f5c8238e915eed1527ffb4309a358a12bb45f5b7
SET LOCAL search_path = public, extensions;

CREATE TABLE IF NOT EXISTS "public"."br_estados" (
  "nome" text NOT NULL,
  "uf" character(2) NOT NULL,
  "regiao" text NOT NULL,
  CONSTRAINT "br_estados_pkey" PRIMARY KEY (nome)
);

ALTER TABLE "public"."br_estados" OWNER TO "postgres";

ALTER TABLE "public"."br_estados" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."br_estados" NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "br_estados_leitura" ON "public"."br_estados";

CREATE POLICY "br_estados_leitura" ON "public"."br_estados" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);

DO $reconstructed_acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='"public"."br_estados"'::regclass LOOP
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "public"."br_estados" FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
 END LOOP;
END
$reconstructed_acl$;

GRANT DELETE ON TABLE "public"."br_estados" TO "postgres";

GRANT INSERT ON TABLE "public"."br_estados" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."br_estados" TO "postgres";

GRANT REFERENCES ON TABLE "public"."br_estados" TO "postgres";

GRANT SELECT ON TABLE "public"."br_estados" TO "postgres";

GRANT TRIGGER ON TABLE "public"."br_estados" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."br_estados" TO "postgres";

GRANT UPDATE ON TABLE "public"."br_estados" TO "postgres";

GRANT DELETE ON TABLE "public"."br_estados" TO "anon";

GRANT INSERT ON TABLE "public"."br_estados" TO "anon";

GRANT MAINTAIN ON TABLE "public"."br_estados" TO "anon";

GRANT REFERENCES ON TABLE "public"."br_estados" TO "anon";

GRANT SELECT ON TABLE "public"."br_estados" TO "anon";

GRANT TRIGGER ON TABLE "public"."br_estados" TO "anon";

GRANT TRUNCATE ON TABLE "public"."br_estados" TO "anon";

GRANT UPDATE ON TABLE "public"."br_estados" TO "anon";

GRANT DELETE ON TABLE "public"."br_estados" TO "authenticated";

GRANT INSERT ON TABLE "public"."br_estados" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."br_estados" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."br_estados" TO "authenticated";

GRANT SELECT ON TABLE "public"."br_estados" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."br_estados" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."br_estados" TO "authenticated";

GRANT UPDATE ON TABLE "public"."br_estados" TO "authenticated";

GRANT DELETE ON TABLE "public"."br_estados" TO "service_role";

GRANT INSERT ON TABLE "public"."br_estados" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."br_estados" TO "service_role";

GRANT REFERENCES ON TABLE "public"."br_estados" TO "service_role";

GRANT SELECT ON TABLE "public"."br_estados" TO "service_role";

GRANT TRIGGER ON TABLE "public"."br_estados" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."br_estados" TO "service_role";

GRANT UPDATE ON TABLE "public"."br_estados" TO "service_role";
-- END OPERATION c46806298423158893dc86d4f5c8238e915eed1527ffb4309a358a12bb45f5b7
