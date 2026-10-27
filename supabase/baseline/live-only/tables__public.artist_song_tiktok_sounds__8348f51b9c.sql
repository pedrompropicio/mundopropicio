-- #352 G3: local disposable replay only. Never apply to Live.
-- object: tables:public.artist_song_tiktok_sounds
-- stage: historical
-- provenance: {"effective_at": "2026-09-21T18:02:25Z", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "2591a131777674445812f202925c40d3af7ee4acb7a275ea6861da27c74cdb80", "oid": 250004, "review": 6416092001, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "51b2952ef8fcc836a8ed790a6de07e6e2f2ad9b28e8c1ff608e5732bb8a620ec", "window": {"effective_at": "2026-09-21T18:02:25Z", "first_reference_version": null, "lower": null, "upper": null}}
-- BEGIN OPERATION 98270fc9edba01c6ef11546a3638268d3728a31f840022cf7abee70ce8208aed
SET LOCAL search_path = public, extensions;

CREATE TABLE IF NOT EXISTS "public"."artist_song_tiktok_sounds" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid DEFAULT current_company_id() NOT NULL,
  "artist_id" uuid NOT NULL,
  "song_id" uuid NOT NULL,
  "music_id" text NOT NULL,
  "title" text,
  "author" text,
  "is_official" boolean DEFAULT false NOT NULL,
  "is_original_sound" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'candidate'::text NOT NULL,
  "matched_song_id" text,
  "discovered_via" text,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "validated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "artist_song_tiktok_sounds_artist_id_fkey1" FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  CONSTRAINT "artist_song_tiktok_sounds_company_id_fkey1" FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT "artist_song_tiktok_sounds_discovered_via_check" CHECK (discovered_via = ANY (ARRAY['seed'::text, 'hashtag'::text, 'manual_link'::text, 'panel'::text])),
  CONSTRAINT "artist_song_tiktok_sounds_key" UNIQUE (song_id, music_id),
  CONSTRAINT "artist_song_tiktok_sounds_pkey1" PRIMARY KEY (id),
  CONSTRAINT "artist_song_tiktok_sounds_song_id_fkey1" FOREIGN KEY (song_id) REFERENCES artist_songs(id) ON DELETE CASCADE,
  CONSTRAINT "artist_song_tiktok_sounds_status_check" CHECK (status = ANY (ARRAY['candidate'::text, 'validated'::text, 'rejected'::text]))
);

ALTER TABLE "public"."artist_song_tiktok_sounds" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS artist_song_tiktok_sounds_music_id_idx ON public.artist_song_tiktok_sounds USING btree (music_id);

ALTER TABLE "public"."artist_song_tiktok_sounds" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."artist_song_tiktok_sounds" NO FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE TRIGGER set_artist_song_tiktok_sounds_updated_at BEFORE UPDATE ON artist_song_tiktok_sounds FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE "public"."artist_song_tiktok_sounds" ENABLE TRIGGER "set_artist_song_tiktok_sounds_updated_at";

DO $reconstructed_acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='"public"."artist_song_tiktok_sounds"'::regclass LOOP
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "public"."artist_song_tiktok_sounds" FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
 END LOOP;
END
$reconstructed_acl$;

GRANT DELETE ON TABLE "public"."artist_song_tiktok_sounds" TO "postgres";

GRANT INSERT ON TABLE "public"."artist_song_tiktok_sounds" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."artist_song_tiktok_sounds" TO "postgres";

GRANT REFERENCES ON TABLE "public"."artist_song_tiktok_sounds" TO "postgres";

GRANT SELECT ON TABLE "public"."artist_song_tiktok_sounds" TO "postgres";

GRANT TRIGGER ON TABLE "public"."artist_song_tiktok_sounds" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."artist_song_tiktok_sounds" TO "postgres";

GRANT UPDATE ON TABLE "public"."artist_song_tiktok_sounds" TO "postgres";

GRANT DELETE ON TABLE "public"."artist_song_tiktok_sounds" TO "anon";

GRANT INSERT ON TABLE "public"."artist_song_tiktok_sounds" TO "anon";

GRANT MAINTAIN ON TABLE "public"."artist_song_tiktok_sounds" TO "anon";

GRANT REFERENCES ON TABLE "public"."artist_song_tiktok_sounds" TO "anon";

GRANT SELECT ON TABLE "public"."artist_song_tiktok_sounds" TO "anon";

GRANT TRIGGER ON TABLE "public"."artist_song_tiktok_sounds" TO "anon";

GRANT TRUNCATE ON TABLE "public"."artist_song_tiktok_sounds" TO "anon";

GRANT UPDATE ON TABLE "public"."artist_song_tiktok_sounds" TO "anon";

GRANT DELETE ON TABLE "public"."artist_song_tiktok_sounds" TO "authenticated";

GRANT INSERT ON TABLE "public"."artist_song_tiktok_sounds" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."artist_song_tiktok_sounds" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."artist_song_tiktok_sounds" TO "authenticated";

GRANT SELECT ON TABLE "public"."artist_song_tiktok_sounds" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."artist_song_tiktok_sounds" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."artist_song_tiktok_sounds" TO "authenticated";

GRANT UPDATE ON TABLE "public"."artist_song_tiktok_sounds" TO "authenticated";

GRANT DELETE ON TABLE "public"."artist_song_tiktok_sounds" TO "service_role";

GRANT INSERT ON TABLE "public"."artist_song_tiktok_sounds" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."artist_song_tiktok_sounds" TO "service_role";

GRANT REFERENCES ON TABLE "public"."artist_song_tiktok_sounds" TO "service_role";

GRANT SELECT ON TABLE "public"."artist_song_tiktok_sounds" TO "service_role";

GRANT TRIGGER ON TABLE "public"."artist_song_tiktok_sounds" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."artist_song_tiktok_sounds" TO "service_role";

GRANT UPDATE ON TABLE "public"."artist_song_tiktok_sounds" TO "service_role";

DROP POLICY IF EXISTS artist_song_tiktok_sounds_select ON public.artist_song_tiktok_sounds;

CREATE POLICY artist_song_tiktok_sounds_select
  ON public.artist_song_tiktok_sounds
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS artist_song_tiktok_sounds_write ON public.artist_song_tiktok_sounds;

CREATE POLICY artist_song_tiktok_sounds_write
  ON public.artist_song_tiktok_sounds
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

DROP POLICY IF EXISTS company_isolation_artist_song_tiktok_sounds ON public.artist_song_tiktok_sounds;

CREATE POLICY company_isolation_artist_song_tiktok_sounds
  ON public.artist_song_tiktok_sounds
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (row_belongs_to_current_company(company_id))
  WITH CHECK (row_belongs_to_current_company(company_id));
-- END OPERATION 98270fc9edba01c6ef11546a3638268d3728a31f840022cf7abee70ce8208aed
