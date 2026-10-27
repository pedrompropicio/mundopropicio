-- #352 G3: local disposable replay only. Never apply to Live.
-- object: tables:public.song_link_diag
-- stage: historical
-- provenance: {"effective_at": "2026-10-07T01:09:15Z", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "2591a131777674445812f202925c40d3af7ee4acb7a275ea6861da27c74cdb80", "oid": 353799, "review": {"historical_authorization": "approved frozen G2, confirmation 6450286547", "promotion": 6449906971}, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "45b247cdcd3b46ca3ba5c3e62405a61dfaa44f1c08a7c696ece2301807d090a0", "window": {"effective_at": "2026-10-07T01:09:15Z", "first_reference_version": null, "lower": null, "upper": null}}
-- BEGIN OPERATION 8c643a5a6c6b1251353380c4ea38bb21004e637316c4d363953b679fa183b447
SET LOCAL search_path = public, extensions;

CREATE TABLE IF NOT EXISTS "public"."song_link_diag" (
  "id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "arrival_event_id" uuid,
  "slug" text NOT NULL,
  "kind" text NOT NULL,
  "ms" integer,
  "in_app" text,
  "detail" text,
  CONSTRAINT "song_link_diag_detail_check" CHECK (char_length(detail) <= 60),
  CONSTRAINT "song_link_diag_in_app_check" CHECK (in_app = ANY (ARRAY['tiktok'::text, 'instagram'::text, 'facebook'::text, 'other'::text])),
  CONSTRAINT "song_link_diag_kind_check" CHECK (kind = ANY (ARRAY['shown'::text, 'tap_button'::text, 'tap_other'::text, 'hidden'::text, 'visible'::text, 'pagehide'::text, 'redirect'::text, 'prefetch'::text, 'feedback_shown'::text, 'tap_repeat_blocked'::text])),
  CONSTRAINT "song_link_diag_ms_check" CHECK (ms >= 0 AND ms <= 86400000),
  CONSTRAINT "song_link_diag_pkey" PRIMARY KEY (id),
  CONSTRAINT "song_link_diag_slug_check" CHECK (char_length(slug) <= 80)
);

ALTER TABLE "public"."song_link_diag" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS song_link_diag_created_idx ON public.song_link_diag USING btree (created_at);

ALTER TABLE "public"."song_link_diag" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."song_link_diag" NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "song_link_diag_insert" ON "public"."song_link_diag";

CREATE POLICY "song_link_diag_insert" ON "public"."song_link_diag" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (true);

DO $reconstructed_acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='"public"."song_link_diag"'::regclass LOOP
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "public"."song_link_diag" FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
 END LOOP;
END
$reconstructed_acl$;

GRANT DELETE ON TABLE "public"."song_link_diag" TO "postgres";

GRANT INSERT ON TABLE "public"."song_link_diag" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."song_link_diag" TO "postgres";

GRANT REFERENCES ON TABLE "public"."song_link_diag" TO "postgres";

GRANT SELECT ON TABLE "public"."song_link_diag" TO "postgres";

GRANT TRIGGER ON TABLE "public"."song_link_diag" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."song_link_diag" TO "postgres";

GRANT UPDATE ON TABLE "public"."song_link_diag" TO "postgres";

GRANT INSERT ON TABLE "public"."song_link_diag" TO "anon";

GRANT MAINTAIN ON TABLE "public"."song_link_diag" TO "anon";

GRANT REFERENCES ON TABLE "public"."song_link_diag" TO "anon";

GRANT TRIGGER ON TABLE "public"."song_link_diag" TO "anon";

GRANT INSERT ON TABLE "public"."song_link_diag" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."song_link_diag" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."song_link_diag" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."song_link_diag" TO "authenticated";

GRANT DELETE ON TABLE "public"."song_link_diag" TO "service_role";

GRANT INSERT ON TABLE "public"."song_link_diag" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."song_link_diag" TO "service_role";

GRANT REFERENCES ON TABLE "public"."song_link_diag" TO "service_role";

GRANT SELECT ON TABLE "public"."song_link_diag" TO "service_role";

GRANT TRIGGER ON TABLE "public"."song_link_diag" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."song_link_diag" TO "service_role";

GRANT UPDATE ON TABLE "public"."song_link_diag" TO "service_role";

DO $identity_guard$
DECLARE identity_mode "char";
BEGIN
  SELECT attidentity INTO STRICT identity_mode
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.song_link_diag'::regclass
    AND attname = 'id' AND attnum > 0 AND NOT attisdropped;
  IF identity_mode = '' THEN
    ALTER TABLE "public"."song_link_diag" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE);
  ELSIF identity_mode <> 'a' THEN
    RAISE EXCEPTION 'Unexpected identity mode for public.song_link_diag.id: %', identity_mode;
  END IF;
END
$identity_guard$;

DO $sequence_acl$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('S',c.relowner))) a WHERE c.oid='"public"."song_link_diag_id_seq"'::regclass LOOP EXECUTE 'REVOKE ALL ON SEQUENCE "public"."song_link_diag_id_seq" FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $sequence_acl$;

GRANT SELECT ON SEQUENCE "public"."song_link_diag_id_seq" TO "postgres";

GRANT UPDATE ON SEQUENCE "public"."song_link_diag_id_seq" TO "postgres";

GRANT USAGE ON SEQUENCE "public"."song_link_diag_id_seq" TO "postgres";

GRANT SELECT ON SEQUENCE "public"."song_link_diag_id_seq" TO "anon";

GRANT UPDATE ON SEQUENCE "public"."song_link_diag_id_seq" TO "anon";

GRANT USAGE ON SEQUENCE "public"."song_link_diag_id_seq" TO "anon";

GRANT SELECT ON SEQUENCE "public"."song_link_diag_id_seq" TO "authenticated";

GRANT UPDATE ON SEQUENCE "public"."song_link_diag_id_seq" TO "authenticated";

GRANT USAGE ON SEQUENCE "public"."song_link_diag_id_seq" TO "authenticated";

GRANT SELECT ON SEQUENCE "public"."song_link_diag_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE "public"."song_link_diag_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE "public"."song_link_diag_id_seq" TO "service_role";
-- END OPERATION 8c643a5a6c6b1251353380c4ea38bb21004e637316c4d363953b679fa183b447
