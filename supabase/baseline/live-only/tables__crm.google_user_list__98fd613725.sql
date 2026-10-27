-- #352 G3: local disposable replay only. Never apply to Live.
-- object: tables:crm.google_user_list
-- stage: historical
-- provenance: {"effective_at": "2026-06-14T16:57:00Z", "live_catalog_sha256": "b9f8cd81354e89128e410ec893baf3d43c696e659e7517167d5ee61632b3e7e8", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "2591a131777674445812f202925c40d3af7ee4acb7a275ea6861da27c74cdb80", "oid": 143856, "review": "https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6405248457", "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "9c669a2c01dcd6da5be6f5670e6fcbfa89f4f1b314045e01883176faab67409c", "window": {"effective_at": "2026-06-14T16:57:00Z", "first_reference_version": "20260615195703", "lower": null, "upper": null}}
-- BEGIN OPERATION 803ce9b63ccf3c1c625e8d259303ad235f8298f754168d2005030dae9b81d7df
SET LOCAL search_path = public, extensions;

CREATE TABLE IF NOT EXISTS "crm"."google_user_list" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "connection_id" uuid,
  "name" text NOT NULL,
  "description" text,
  "list_type" text DEFAULT 'CUSTOMER_MATCH'::text NOT NULL,
  "upload_key_type" text DEFAULT 'CONTACT_INFO'::text NOT NULL,
  "membership_life_span" integer DEFAULT 540 NOT NULL,
  "external_user_list_id" text,
  "external_resource_name" text,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "member_count" integer,
  "last_synced_at" timestamp with time zone,
  "raw" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "google_user_list_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES crm.ad_platform_connections(id) ON DELETE SET NULL,
  CONSTRAINT "google_user_list_pkey" PRIMARY KEY (id),
  CONSTRAINT "google_user_list_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'error'::text])),
  CONSTRAINT "uq_google_user_list_name" UNIQUE (company_id, name)
);

ALTER TABLE "crm"."google_user_list" OWNER TO "postgres";

CREATE UNIQUE INDEX IF NOT EXISTS uq_google_user_list_external ON crm.google_user_list USING btree (company_id, external_user_list_id) WHERE (external_user_list_id IS NOT NULL);

ALTER TABLE "crm"."google_user_list" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "crm"."google_user_list" NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_bypass" ON "crm"."google_user_list";

CREATE POLICY "service_role_bypass" ON "crm"."google_user_list" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_isolation_insert" ON "crm"."google_user_list";

CREATE POLICY "tenant_isolation_insert" ON "crm"."google_user_list" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((company_id = current_company_id()));

DROP POLICY IF EXISTS "tenant_isolation_select" ON "crm"."google_user_list";

CREATE POLICY "tenant_isolation_select" ON "crm"."google_user_list" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id = current_company_id()));

DROP POLICY IF EXISTS "tenant_isolation_update" ON "crm"."google_user_list";

CREATE POLICY "tenant_isolation_update" ON "crm"."google_user_list" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));

CREATE OR REPLACE TRIGGER trg_google_user_list_touch_updated_at BEFORE UPDATE ON crm.google_user_list FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

ALTER TABLE "crm"."google_user_list" ENABLE TRIGGER "trg_google_user_list_touch_updated_at";

DO $reconstructed_acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='"crm"."google_user_list"'::regclass LOOP
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "crm"."google_user_list" FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
 END LOOP;
END
$reconstructed_acl$;

GRANT DELETE ON TABLE "crm"."google_user_list" TO "postgres";

GRANT INSERT ON TABLE "crm"."google_user_list" TO "postgres";

GRANT MAINTAIN ON TABLE "crm"."google_user_list" TO "postgres";

GRANT REFERENCES ON TABLE "crm"."google_user_list" TO "postgres";

GRANT SELECT ON TABLE "crm"."google_user_list" TO "postgres";

GRANT TRIGGER ON TABLE "crm"."google_user_list" TO "postgres";

GRANT TRUNCATE ON TABLE "crm"."google_user_list" TO "postgres";

GRANT UPDATE ON TABLE "crm"."google_user_list" TO "postgres";

GRANT INSERT ON TABLE "crm"."google_user_list" TO "authenticated";

GRANT SELECT ON TABLE "crm"."google_user_list" TO "authenticated";

GRANT UPDATE ON TABLE "crm"."google_user_list" TO "authenticated";

GRANT DELETE ON TABLE "crm"."google_user_list" TO "service_role";

GRANT INSERT ON TABLE "crm"."google_user_list" TO "service_role";

GRANT SELECT ON TABLE "crm"."google_user_list" TO "service_role";

GRANT UPDATE ON TABLE "crm"."google_user_list" TO "service_role";
-- END OPERATION 803ce9b63ccf3c1c625e8d259303ad235f8298f754168d2005030dae9b81d7df
