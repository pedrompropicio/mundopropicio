-- #352 G3: local disposable replay only. Never apply to Live.
-- object: tables:crm.google_ad
-- stage: historical
-- provenance: {"effective_at": "2026-09-19T20:09:01Z", "live_catalog_sha256": "761aa923cdd36261fdb14023c2051577fca687b0c2f3135e9453c97a499adee0", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "2591a131777674445812f202925c40d3af7ee4acb7a275ea6861da27c74cdb80", "oid": 241420, "review": "https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6405248457", "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "4b4c61314ed9c7b78b62dff365b2b007626e65cf775fb77da4df1eb385e900fd", "window": {"effective_at": "2026-09-19T20:09:01Z", "first_reference_version": "20260921180146", "lower": null, "upper": null}}
-- BEGIN OPERATION 835f889e2e8a33632541d0a9badc974ad9622cb2a61bad73e82e28026df70d4c
SET LOCAL search_path = public, extensions;

CREATE TABLE IF NOT EXISTS "crm"."google_ad" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "connection_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "customer_id" text,
  "external_campaign_id" text NOT NULL,
  "external_ad_group_id" text NOT NULL,
  "external_ad_id" text NOT NULL,
  "resource_name" text,
  "name" text,
  "status" text,
  "type" text,
  "youtube_video_id" text,
  "youtube_video_title" text,
  "final_urls" jsonb,
  "raw" jsonb,
  "last_synced_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "google_ad_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  CONSTRAINT "google_ad_pkey" PRIMARY KEY (id)
);

ALTER TABLE "crm"."google_ad" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS ix_google_ad_campaign ON crm.google_ad USING btree (connection_id, external_campaign_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_google_ad ON crm.google_ad USING btree (connection_id, external_ad_id);

ALTER TABLE "crm"."google_ad" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "crm"."google_ad" NO FORCE ROW LEVEL SECURITY;

DO $reconstructed_acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='"crm"."google_ad"'::regclass LOOP
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "crm"."google_ad" FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
 END LOOP;
END
$reconstructed_acl$;

GRANT DELETE ON TABLE "crm"."google_ad" TO "postgres";

GRANT INSERT ON TABLE "crm"."google_ad" TO "postgres";

GRANT MAINTAIN ON TABLE "crm"."google_ad" TO "postgres";

GRANT REFERENCES ON TABLE "crm"."google_ad" TO "postgres";

GRANT SELECT ON TABLE "crm"."google_ad" TO "postgres";

GRANT TRIGGER ON TABLE "crm"."google_ad" TO "postgres";

GRANT TRUNCATE ON TABLE "crm"."google_ad" TO "postgres";

GRANT UPDATE ON TABLE "crm"."google_ad" TO "postgres";

GRANT DELETE ON TABLE "crm"."google_ad" TO "service_role";

GRANT INSERT ON TABLE "crm"."google_ad" TO "service_role";

GRANT SELECT ON TABLE "crm"."google_ad" TO "service_role";

GRANT UPDATE ON TABLE "crm"."google_ad" TO "service_role";
-- END OPERATION 835f889e2e8a33632541d0a9badc974ad9622cb2a61bad73e82e28026df70d4c
