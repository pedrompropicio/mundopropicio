-- #352 G3: local disposable replay only. Never apply to Live.
-- object: tables:public.artist_song_tiktok_groups
-- stage: historical
-- provenance: {"effective_at": "2026-09-21T18:02:24Z", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "2591a131777674445812f202925c40d3af7ee4acb7a275ea6861da27c74cdb80", "oid": 249629, "review": 6416092001, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "dc23a9e32b9dbbc456836438a458cdd56d8122e8c28929a98485029ec1b05f99", "window": {"effective_at": "2026-09-21T18:02:24Z", "first_reference_version": null, "lower": null, "upper": null}}
-- BEGIN OPERATION 9e8b1fe277c9819ed6a15dcc3cf88c959f11051f2b0052fe3412f235b4a766d4
SET LOCAL search_path = public, extensions;

CREATE TABLE IF NOT EXISTS "public"."artist_song_tiktok_groups" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid DEFAULT current_company_id() NOT NULL,
  "artist_id" uuid NOT NULL,
  "song_id" uuid NOT NULL,
  "group_id" text NOT NULL,
  "song_name" text,
  "is_primary" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "artist_song_tiktok_groups_key" UNIQUE (song_id, group_id),
  CONSTRAINT "artist_song_tiktok_sounds_artist_id_fkey" FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  CONSTRAINT "artist_song_tiktok_sounds_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT "artist_song_tiktok_sounds_pkey" PRIMARY KEY (id),
  CONSTRAINT "artist_song_tiktok_sounds_song_id_fkey" FOREIGN KEY (song_id) REFERENCES artist_songs(id) ON DELETE CASCADE
);

ALTER TABLE "public"."artist_song_tiktok_groups" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS artist_song_tiktok_groups_group_id_idx ON public.artist_song_tiktok_groups USING btree (group_id);

ALTER TABLE "public"."artist_song_tiktok_groups" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."artist_song_tiktok_groups" NO FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE TRIGGER set_artist_song_tiktok_groups_updated_at BEFORE UPDATE ON artist_song_tiktok_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE "public"."artist_song_tiktok_groups" ENABLE TRIGGER "set_artist_song_tiktok_groups_updated_at";

DO $reconstructed_acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='"public"."artist_song_tiktok_groups"'::regclass LOOP
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "public"."artist_song_tiktok_groups" FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
 END LOOP;
END
$reconstructed_acl$;

GRANT DELETE ON TABLE "public"."artist_song_tiktok_groups" TO "postgres";

GRANT INSERT ON TABLE "public"."artist_song_tiktok_groups" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."artist_song_tiktok_groups" TO "postgres";

GRANT REFERENCES ON TABLE "public"."artist_song_tiktok_groups" TO "postgres";

GRANT SELECT ON TABLE "public"."artist_song_tiktok_groups" TO "postgres";

GRANT TRIGGER ON TABLE "public"."artist_song_tiktok_groups" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."artist_song_tiktok_groups" TO "postgres";

GRANT UPDATE ON TABLE "public"."artist_song_tiktok_groups" TO "postgres";

GRANT DELETE ON TABLE "public"."artist_song_tiktok_groups" TO "anon";

GRANT INSERT ON TABLE "public"."artist_song_tiktok_groups" TO "anon";

GRANT MAINTAIN ON TABLE "public"."artist_song_tiktok_groups" TO "anon";

GRANT REFERENCES ON TABLE "public"."artist_song_tiktok_groups" TO "anon";

GRANT SELECT ON TABLE "public"."artist_song_tiktok_groups" TO "anon";

GRANT TRIGGER ON TABLE "public"."artist_song_tiktok_groups" TO "anon";

GRANT TRUNCATE ON TABLE "public"."artist_song_tiktok_groups" TO "anon";

GRANT UPDATE ON TABLE "public"."artist_song_tiktok_groups" TO "anon";

GRANT DELETE ON TABLE "public"."artist_song_tiktok_groups" TO "authenticated";

GRANT INSERT ON TABLE "public"."artist_song_tiktok_groups" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."artist_song_tiktok_groups" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."artist_song_tiktok_groups" TO "authenticated";

GRANT SELECT ON TABLE "public"."artist_song_tiktok_groups" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."artist_song_tiktok_groups" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."artist_song_tiktok_groups" TO "authenticated";

GRANT UPDATE ON TABLE "public"."artist_song_tiktok_groups" TO "authenticated";

GRANT DELETE ON TABLE "public"."artist_song_tiktok_groups" TO "service_role";

GRANT INSERT ON TABLE "public"."artist_song_tiktok_groups" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."artist_song_tiktok_groups" TO "service_role";

GRANT REFERENCES ON TABLE "public"."artist_song_tiktok_groups" TO "service_role";

GRANT SELECT ON TABLE "public"."artist_song_tiktok_groups" TO "service_role";

GRANT TRIGGER ON TABLE "public"."artist_song_tiktok_groups" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."artist_song_tiktok_groups" TO "service_role";

GRANT UPDATE ON TABLE "public"."artist_song_tiktok_groups" TO "service_role";

DROP POLICY IF EXISTS artist_song_tiktok_groups_select ON public.artist_song_tiktok_groups;

CREATE POLICY artist_song_tiktok_groups_select
  ON public.artist_song_tiktok_groups
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS artist_song_tiktok_groups_write ON public.artist_song_tiktok_groups;

CREATE POLICY artist_song_tiktok_groups_write
  ON public.artist_song_tiktok_groups
  FOR ALL TO authenticated
  USING (
    has_role((SELECT auth.uid()), 'admin'::app_role)
    OR has_role((SELECT auth.uid()), 'platform_admin'::app_role)
    OR has_role((SELECT auth.uid()), 'manager'::app_role)
    OR has_role((SELECT auth.uid()), 'editor'::app_role)
  )
  WITH CHECK (
    has_role((SELECT auth.uid()), 'admin'::app_role)
    OR has_role((SELECT auth.uid()), 'platform_admin'::app_role)
    OR has_role((SELECT auth.uid()), 'manager'::app_role)
    OR has_role((SELECT auth.uid()), 'editor'::app_role)
  );

DROP POLICY IF EXISTS company_isolation_artist_song_tiktok_groups ON public.artist_song_tiktok_groups;

CREATE POLICY company_isolation_artist_song_tiktok_groups
  ON public.artist_song_tiktok_groups
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (row_belongs_to_current_company(company_id))
  WITH CHECK (row_belongs_to_current_company(company_id));
-- END OPERATION 9e8b1fe277c9819ed6a15dcc3cf88c959f11051f2b0052fe3412f235b4a766d4
