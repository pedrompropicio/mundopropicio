-- #352 G3: local disposable replay only. Never apply to Live.
-- object: tables:public.artist_song_tiktok_sound_daily
-- stage: historical
-- provenance: {"effective_at": "2026-09-21T18:02:26Z", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "2591a131777674445812f202925c40d3af7ee4acb7a275ea6861da27c74cdb80", "oid": 250043, "review": 6416092001, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "9de1e86c38eefa5266bd68a8080daf090905fbeb61d821b2f170ff84d0fd35af", "window": {"effective_at": "2026-09-21T18:02:26Z", "first_reference_version": null, "lower": null, "upper": null}}
-- BEGIN OPERATION 5ac7d3a48651b9be429d43dbf2fdc2bf0c56d1831dba7aa0bdb1900e1e1fb8df
SET LOCAL search_path = public, extensions;

CREATE TABLE IF NOT EXISTS "public"."artist_song_tiktok_sound_daily" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid DEFAULT current_company_id() NOT NULL,
  "song_id" uuid NOT NULL,
  "music_id" text NOT NULL,
  "metric_date" date NOT NULL,
  "video_count" bigint,
  "source" text DEFAULT 'apify'::text NOT NULL,
  "source_ref" text,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "artist_song_tiktok_sound_daily_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT "artist_song_tiktok_sound_daily_key" UNIQUE (music_id, metric_date),
  CONSTRAINT "artist_song_tiktok_sound_daily_pkey" PRIMARY KEY (id),
  CONSTRAINT "artist_song_tiktok_sound_daily_song_id_fkey" FOREIGN KEY (song_id) REFERENCES artist_songs(id) ON DELETE CASCADE
);

ALTER TABLE "public"."artist_song_tiktok_sound_daily" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS artist_song_tiktok_sound_daily_song_date_idx ON public.artist_song_tiktok_sound_daily USING btree (song_id, metric_date);

ALTER TABLE "public"."artist_song_tiktok_sound_daily" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."artist_song_tiktok_sound_daily" NO FORCE ROW LEVEL SECURITY;

DO $reconstructed_acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='"public"."artist_song_tiktok_sound_daily"'::regclass LOOP
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "public"."artist_song_tiktok_sound_daily" FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
 END LOOP;
END
$reconstructed_acl$;

GRANT DELETE ON TABLE "public"."artist_song_tiktok_sound_daily" TO "postgres";

GRANT INSERT ON TABLE "public"."artist_song_tiktok_sound_daily" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."artist_song_tiktok_sound_daily" TO "postgres";

GRANT REFERENCES ON TABLE "public"."artist_song_tiktok_sound_daily" TO "postgres";

GRANT SELECT ON TABLE "public"."artist_song_tiktok_sound_daily" TO "postgres";

GRANT TRIGGER ON TABLE "public"."artist_song_tiktok_sound_daily" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."artist_song_tiktok_sound_daily" TO "postgres";

GRANT UPDATE ON TABLE "public"."artist_song_tiktok_sound_daily" TO "postgres";

GRANT DELETE ON TABLE "public"."artist_song_tiktok_sound_daily" TO "anon";

GRANT INSERT ON TABLE "public"."artist_song_tiktok_sound_daily" TO "anon";

GRANT MAINTAIN ON TABLE "public"."artist_song_tiktok_sound_daily" TO "anon";

GRANT REFERENCES ON TABLE "public"."artist_song_tiktok_sound_daily" TO "anon";

GRANT SELECT ON TABLE "public"."artist_song_tiktok_sound_daily" TO "anon";

GRANT TRIGGER ON TABLE "public"."artist_song_tiktok_sound_daily" TO "anon";

GRANT TRUNCATE ON TABLE "public"."artist_song_tiktok_sound_daily" TO "anon";

GRANT UPDATE ON TABLE "public"."artist_song_tiktok_sound_daily" TO "anon";

GRANT DELETE ON TABLE "public"."artist_song_tiktok_sound_daily" TO "authenticated";

GRANT INSERT ON TABLE "public"."artist_song_tiktok_sound_daily" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."artist_song_tiktok_sound_daily" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."artist_song_tiktok_sound_daily" TO "authenticated";

GRANT SELECT ON TABLE "public"."artist_song_tiktok_sound_daily" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."artist_song_tiktok_sound_daily" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."artist_song_tiktok_sound_daily" TO "authenticated";

GRANT UPDATE ON TABLE "public"."artist_song_tiktok_sound_daily" TO "authenticated";

GRANT DELETE ON TABLE "public"."artist_song_tiktok_sound_daily" TO "service_role";

GRANT INSERT ON TABLE "public"."artist_song_tiktok_sound_daily" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."artist_song_tiktok_sound_daily" TO "service_role";

GRANT REFERENCES ON TABLE "public"."artist_song_tiktok_sound_daily" TO "service_role";

GRANT SELECT ON TABLE "public"."artist_song_tiktok_sound_daily" TO "service_role";

GRANT TRIGGER ON TABLE "public"."artist_song_tiktok_sound_daily" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."artist_song_tiktok_sound_daily" TO "service_role";

GRANT UPDATE ON TABLE "public"."artist_song_tiktok_sound_daily" TO "service_role";

DROP POLICY IF EXISTS artist_song_tiktok_sound_daily_select ON public.artist_song_tiktok_sound_daily;

CREATE POLICY artist_song_tiktok_sound_daily_select
  ON public.artist_song_tiktok_sound_daily
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS artist_song_tiktok_sound_daily_write ON public.artist_song_tiktok_sound_daily;

CREATE POLICY artist_song_tiktok_sound_daily_write
  ON public.artist_song_tiktok_sound_daily
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

DROP POLICY IF EXISTS company_isolation_artist_song_tiktok_sound_daily ON public.artist_song_tiktok_sound_daily;

CREATE POLICY company_isolation_artist_song_tiktok_sound_daily
  ON public.artist_song_tiktok_sound_daily
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (row_belongs_to_current_company(company_id))
  WITH CHECK (row_belongs_to_current_company(company_id));
-- END OPERATION 5ac7d3a48651b9be429d43dbf2fdc2bf0c56d1831dba7aa0bdb1900e1e1fb8df
