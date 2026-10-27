-- #352 G3: local disposable replay only. Never apply to Live.
-- object: tables:crm.meta_campaign_strategy_deployments
-- stage: historical
-- provenance: {"effective_at": "2026-05-11T12:00:01Z", "live_catalog_sha256": "f2007d21b141d7e6c2e50276b0076645c7fdd23214dd73025781f849936a078b", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "2591a131777674445812f202925c40d3af7ee4acb7a275ea6861da27c74cdb80", "oid": 81713, "review": 6423818497, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "792a9f92248c3cc367338a2c09b992ef883f67f32357ecd9f955b1b5a6e40976", "window": {"at": 1778500801000}}
-- BEGIN OPERATION c5fb54d18859c14dedef4831d177ed23d8f384951409b6f767fad5de1e1fef11
SET LOCAL search_path = public, extensions;

CREATE TABLE IF NOT EXISTS "crm"."meta_campaign_strategy_deployments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "strategy_id" uuid NOT NULL,
  "connection_id" uuid,
  "ad_account_id" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "meta_campaign_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "meta_adset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "meta_ad_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "log_entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "error_summary" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "duration_ms" integer,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "current_status" text DEFAULT 'paused'::text NOT NULL,
  "last_toggled_at" timestamp with time zone,
  "toggle_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
  CONSTRAINT "meta_campaign_strategy_deployments_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES crm.ad_platform_connections(id) ON DELETE SET NULL,
  CONSTRAINT "meta_campaign_strategy_deployments_current_status_check" CHECK (current_status = ANY (ARRAY['paused'::text, 'active'::text, 'mixed'::text, 'archived'::text])),
  CONSTRAINT "meta_campaign_strategy_deployments_pkey" PRIMARY KEY (id),
  CONSTRAINT "meta_campaign_strategy_deployments_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'success'::text, 'partial'::text, 'failed'::text])),
  CONSTRAINT "meta_campaign_strategy_deployments_strategy_id_fkey" FOREIGN KEY (strategy_id) REFERENCES crm.meta_campaign_strategies(id) ON DELETE CASCADE
);

ALTER TABLE "crm"."meta_campaign_strategy_deployments" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS idx_mcsd_company ON crm.meta_campaign_strategy_deployments USING btree (company_id, status);

CREATE INDEX IF NOT EXISTS idx_mcsd_strategy ON crm.meta_campaign_strategy_deployments USING btree (strategy_id, created_at DESC);

ALTER TABLE "crm"."meta_campaign_strategy_deployments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "crm"."meta_campaign_strategy_deployments" NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_bypass" ON "crm"."meta_campaign_strategy_deployments";

CREATE POLICY "service_role_bypass" ON "crm"."meta_campaign_strategy_deployments" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_insert" ON "crm"."meta_campaign_strategy_deployments";

CREATE POLICY "tenant_insert" ON "crm"."meta_campaign_strategy_deployments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((company_id = current_company_id()));

DROP POLICY IF EXISTS "tenant_select" ON "crm"."meta_campaign_strategy_deployments";

CREATE POLICY "tenant_select" ON "crm"."meta_campaign_strategy_deployments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id = current_company_id()));

DROP POLICY IF EXISTS "tenant_update" ON "crm"."meta_campaign_strategy_deployments";

CREATE POLICY "tenant_update" ON "crm"."meta_campaign_strategy_deployments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));

DO $reconstructed_acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='"crm"."meta_campaign_strategy_deployments"'::regclass LOOP
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "crm"."meta_campaign_strategy_deployments" FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
 END LOOP;
END
$reconstructed_acl$;

GRANT DELETE ON TABLE "crm"."meta_campaign_strategy_deployments" TO "postgres";

GRANT INSERT ON TABLE "crm"."meta_campaign_strategy_deployments" TO "postgres";

GRANT MAINTAIN ON TABLE "crm"."meta_campaign_strategy_deployments" TO "postgres";

GRANT REFERENCES ON TABLE "crm"."meta_campaign_strategy_deployments" TO "postgres";

GRANT SELECT ON TABLE "crm"."meta_campaign_strategy_deployments" TO "postgres";

GRANT TRIGGER ON TABLE "crm"."meta_campaign_strategy_deployments" TO "postgres";

GRANT TRUNCATE ON TABLE "crm"."meta_campaign_strategy_deployments" TO "postgres";

GRANT UPDATE ON TABLE "crm"."meta_campaign_strategy_deployments" TO "postgres";

GRANT DELETE ON TABLE "crm"."meta_campaign_strategy_deployments" TO "authenticated";

GRANT INSERT ON TABLE "crm"."meta_campaign_strategy_deployments" TO "authenticated";

GRANT SELECT ON TABLE "crm"."meta_campaign_strategy_deployments" TO "authenticated";

GRANT UPDATE ON TABLE "crm"."meta_campaign_strategy_deployments" TO "authenticated";

GRANT DELETE ON TABLE "crm"."meta_campaign_strategy_deployments" TO "service_role";

GRANT INSERT ON TABLE "crm"."meta_campaign_strategy_deployments" TO "service_role";

GRANT SELECT ON TABLE "crm"."meta_campaign_strategy_deployments" TO "service_role";

GRANT UPDATE ON TABLE "crm"."meta_campaign_strategy_deployments" TO "service_role";
-- END OPERATION c5fb54d18859c14dedef4831d177ed23d8f384951409b6f767fad5de1e1fef11
