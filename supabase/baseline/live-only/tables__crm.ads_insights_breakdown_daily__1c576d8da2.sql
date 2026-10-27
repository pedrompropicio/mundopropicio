-- #352 G3: local disposable replay only. Never apply to Live.
-- object: tables:crm.ads_insights_breakdown_daily
-- stage: historical
-- provenance: {"effective_at": "2026-09-19T20:09:00Z", "live_catalog_sha256": "d8adee5cac593beb960eafd470e7166c30bc20e35a37676b82388f8da9767401", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "2591a131777674445812f202925c40d3af7ee4acb7a275ea6861da27c74cdb80", "oid": 240229, "review": "https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6405248457", "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "561326708131f14ecc0150d94382fc485c4da6f8f126f45c79040ddf49eee18d", "window": {"effective_at": "2026-09-19T20:09:00Z", "first_reference_version": "20260921180146", "lower": null, "upper": null}}
-- BEGIN OPERATION d2698a8f6834ff2f7649384c4b69653185445cee50c6cd6add0d7f65fa3308e5
SET LOCAL search_path = public, extensions;

CREATE TABLE IF NOT EXISTS "crm"."ads_insights_breakdown_daily" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "connection_id" uuid NOT NULL,
  "platform" text NOT NULL,
  "level" text DEFAULT 'campaign'::text NOT NULL,
  "external_campaign_id" text DEFAULT ''::text NOT NULL,
  "external_adset_id" text DEFAULT ''::text NOT NULL,
  "external_ad_id" text DEFAULT ''::text NOT NULL,
  "campaign_name" text,
  "date_start" date NOT NULL,
  "breakdown" text NOT NULL,
  "breakdown_value" text NOT NULL,
  "impressions" bigint DEFAULT 0 NOT NULL,
  "reach" bigint,
  "clicks" bigint DEFAULT 0 NOT NULL,
  "spend_cents" bigint DEFAULT 0 NOT NULL,
  "video_thruplays" bigint,
  "conversions" numeric,
  "currency" text,
  "source" text DEFAULT 'platform_api'::text NOT NULL,
  "raw" jsonb,
  "last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ads_insights_breakdown_daily_breakdown_check" CHECK (breakdown = ANY (ARRAY['none'::text, 'region'::text, 'city'::text, 'country'::text, 'age'::text, 'gender'::text, 'age_gender'::text, 'publisher_platform'::text, 'device'::text])),
  CONSTRAINT "ads_insights_breakdown_daily_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  CONSTRAINT "ads_insights_breakdown_daily_level_check" CHECK (level = ANY (ARRAY['account'::text, 'campaign'::text, 'adset'::text, 'ad'::text])),
  CONSTRAINT "ads_insights_breakdown_daily_pkey" PRIMARY KEY (id),
  CONSTRAINT "ads_insights_breakdown_daily_platform_check" CHECK (platform = ANY (ARRAY['meta'::text, 'google'::text, 'tiktok'::text]))
);

ALTER TABLE "crm"."ads_insights_breakdown_daily" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS ix_ads_breakdown_company_date ON crm.ads_insights_breakdown_daily USING btree (company_id, platform, date_start DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ads_breakdown_daily ON crm.ads_insights_breakdown_daily USING btree (connection_id, platform, level, external_campaign_id, external_adset_id, external_ad_id, date_start, breakdown, breakdown_value);

ALTER TABLE "crm"."ads_insights_breakdown_daily" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "crm"."ads_insights_breakdown_daily" NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_bypass" ON "crm"."ads_insights_breakdown_daily";

CREATE POLICY "service_role_bypass" ON "crm"."ads_insights_breakdown_daily" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_isolation_insert" ON "crm"."ads_insights_breakdown_daily";

CREATE POLICY "tenant_isolation_insert" ON "crm"."ads_insights_breakdown_daily" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((company_id = current_company_id()));

DROP POLICY IF EXISTS "tenant_isolation_select" ON "crm"."ads_insights_breakdown_daily";

CREATE POLICY "tenant_isolation_select" ON "crm"."ads_insights_breakdown_daily" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((company_id = current_company_id()));

DROP POLICY IF EXISTS "tenant_isolation_update" ON "crm"."ads_insights_breakdown_daily";

CREATE POLICY "tenant_isolation_update" ON "crm"."ads_insights_breakdown_daily" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));

CREATE OR REPLACE TRIGGER trg_ads_breakdown_updated BEFORE UPDATE ON crm.ads_insights_breakdown_daily FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE "crm"."ads_insights_breakdown_daily" ENABLE TRIGGER "trg_ads_breakdown_updated";

DO $reconstructed_acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='"crm"."ads_insights_breakdown_daily"'::regclass LOOP
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "crm"."ads_insights_breakdown_daily" FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
 END LOOP;
END
$reconstructed_acl$;

GRANT DELETE ON TABLE "crm"."ads_insights_breakdown_daily" TO "postgres";

GRANT INSERT ON TABLE "crm"."ads_insights_breakdown_daily" TO "postgres";

GRANT MAINTAIN ON TABLE "crm"."ads_insights_breakdown_daily" TO "postgres";

GRANT REFERENCES ON TABLE "crm"."ads_insights_breakdown_daily" TO "postgres";

GRANT SELECT ON TABLE "crm"."ads_insights_breakdown_daily" TO "postgres";

GRANT TRIGGER ON TABLE "crm"."ads_insights_breakdown_daily" TO "postgres";

GRANT TRUNCATE ON TABLE "crm"."ads_insights_breakdown_daily" TO "postgres";

GRANT UPDATE ON TABLE "crm"."ads_insights_breakdown_daily" TO "postgres";

GRANT DELETE ON TABLE "crm"."ads_insights_breakdown_daily" TO "service_role";

GRANT INSERT ON TABLE "crm"."ads_insights_breakdown_daily" TO "service_role";

GRANT SELECT ON TABLE "crm"."ads_insights_breakdown_daily" TO "service_role";

GRANT UPDATE ON TABLE "crm"."ads_insights_breakdown_daily" TO "service_role";
-- END OPERATION d2698a8f6834ff2f7649384c4b69653185445cee50c6cd6add0d7f65fa3308e5
