-- #352 G3: local disposable replay only. Never apply to Live.
-- object: tables:crm.google_user_list_job
-- stage: historical
-- provenance: {"effective_at": "2026-06-14T16:57:01Z", "live_catalog_sha256": "08783c1344949dda860712e32eef9e1ef0503434fd8cf0e2bd2ba89b4078f734", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "2591a131777674445812f202925c40d3af7ee4acb7a275ea6861da27c74cdb80", "oid": 143884, "review": 6423818497, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "cd78d1bf9c02f4f39f5a5a721c794e2e1be04f4f0c1a5461cdb89b552b255b53", "window": {"at": 1781456221000}}
-- BEGIN OPERATION 48366f37916c7e45411b7c348aae57fc161eac0a88a6db5b60cbea93661affe6
SET LOCAL search_path = public, extensions;

CREATE TABLE IF NOT EXISTS "crm"."google_user_list_job" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "user_list_id" uuid NOT NULL,
  "external_job_resource" text,
  "operation" text DEFAULT 'add'::text NOT NULL,
  "members_submitted" integer,
  "members_matched" integer,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "error_detail" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "raw" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "google_user_list_job_operation_check" CHECK (operation = ANY (ARRAY['add'::text, 'remove'::text])),
  CONSTRAINT "google_user_list_job_pkey" PRIMARY KEY (id),
  CONSTRAINT "google_user_list_job_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'success'::text, 'failed'::text])),
  CONSTRAINT "google_user_list_job_user_list_id_fkey" FOREIGN KEY (user_list_id) REFERENCES crm.google_user_list(id) ON DELETE CASCADE
);

ALTER TABLE "crm"."google_user_list_job" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS idx_google_user_list_job_company_list_created ON crm.google_user_list_job USING btree (company_id, user_list_id, created_at DESC);

ALTER TABLE "crm"."google_user_list_job" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "crm"."google_user_list_job" NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_bypass" ON "crm"."google_user_list_job";

CREATE POLICY "service_role_bypass" ON "crm"."google_user_list_job" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_isolation_insert" ON "crm"."google_user_list_job";

CREATE POLICY "tenant_isolation_insert" ON "crm"."google_user_list_job" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((company_id = current_company_id()));

DROP POLICY IF EXISTS "tenant_isolation_select" ON "crm"."google_user_list_job";

CREATE POLICY "tenant_isolation_select" ON "crm"."google_user_list_job" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id = current_company_id()));

DROP POLICY IF EXISTS "tenant_isolation_update" ON "crm"."google_user_list_job";

CREATE POLICY "tenant_isolation_update" ON "crm"."google_user_list_job" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));

CREATE OR REPLACE TRIGGER trg_google_user_list_job_touch_updated_at BEFORE UPDATE ON crm.google_user_list_job FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

ALTER TABLE "crm"."google_user_list_job" ENABLE TRIGGER "trg_google_user_list_job_touch_updated_at";

DO $reconstructed_acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='"crm"."google_user_list_job"'::regclass LOOP
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "crm"."google_user_list_job" FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
 END LOOP;
END
$reconstructed_acl$;

GRANT DELETE ON TABLE "crm"."google_user_list_job" TO "postgres";

GRANT INSERT ON TABLE "crm"."google_user_list_job" TO "postgres";

GRANT MAINTAIN ON TABLE "crm"."google_user_list_job" TO "postgres";

GRANT REFERENCES ON TABLE "crm"."google_user_list_job" TO "postgres";

GRANT SELECT ON TABLE "crm"."google_user_list_job" TO "postgres";

GRANT TRIGGER ON TABLE "crm"."google_user_list_job" TO "postgres";

GRANT TRUNCATE ON TABLE "crm"."google_user_list_job" TO "postgres";

GRANT UPDATE ON TABLE "crm"."google_user_list_job" TO "postgres";

GRANT INSERT ON TABLE "crm"."google_user_list_job" TO "authenticated";

GRANT SELECT ON TABLE "crm"."google_user_list_job" TO "authenticated";

GRANT UPDATE ON TABLE "crm"."google_user_list_job" TO "authenticated";

GRANT DELETE ON TABLE "crm"."google_user_list_job" TO "service_role";

GRANT INSERT ON TABLE "crm"."google_user_list_job" TO "service_role";

GRANT SELECT ON TABLE "crm"."google_user_list_job" TO "service_role";

GRANT UPDATE ON TABLE "crm"."google_user_list_job" TO "service_role";
-- END OPERATION 48366f37916c7e45411b7c348aae57fc161eac0a88a6db5b60cbea93661affe6
