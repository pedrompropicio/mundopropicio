-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.copy_event_tour_content(pg_catalog.uuid,pg_catalog._uuid,pg_catalog.bool,pg_catalog.bool,pg_catalog.bool,pg_catalog.bool)
-- stage: historical
-- provenance: {"effective_at": "2026-07-01T01:24:37Z", "live_catalog_sha256": "06133ab9a79dbdb9179b1e7a4d4ed043b890577c80d48aa14fd04bc8d141c6c0", "live_definition_sha256": "6e6b25964f1c8ba1e169e60a95179c5f987fb509c8b881746c58128dfeb841b2", "live_properties_sha256": "dab695c220c834499929326498f67dfa0a5130363879e53384e104fab3cd93c6", "oid": 171209, "review": 6423818497, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "6ae5ab44ed23d83c08409532614fe1b86a0804108e2872b6297f616c9ef1cc57", "window": {"at": 1782869077000}}
-- BEGIN OPERATION 779132612d4f99d82f2a7160a867911d8578b84a7fdca1556e0ea25922dcbe5a
CREATE OR REPLACE FUNCTION public.copy_event_tour_content(p_source uuid, p_targets uuid[], p_include_text boolean DEFAULT true, p_include_creatives boolean DEFAULT true, p_include_faqs boolean DEFAULT true, p_include_lineup boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  t uuid;
  src jsonb;
  src_text jsonb;
  src_creatives jsonb := '{}'::jsonb;
  base jsonb;
  merged jsonb;
  v_company uuid;
  creative_keys text[] := array['hero_image_url','poster_vertical_url','og_image_url','hero_video_url','gallery_urls'];
  k text;
  n_marketing int := 0; n_faqs int := 0; n_lineup int := 0; c int;
begin
  if p_include_text or p_include_creatives then
    select to_jsonb(em) - 'id' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by' - 'published_at'
      into src
    from public.event_marketing em where em.event_id = p_source;
    if src is not null then
      src_text := src;
      foreach k in array creative_keys loop
        if src ? k then
          src_creatives := src_creatives || jsonb_build_object(k, src->k);
          src_text := src_text - k;
        end if;
      end loop;
    end if;
  end if;

  foreach t in array coalesce(p_targets, '{}'::uuid[]) loop
    if t = p_source then continue; end if;
    select company_id into v_company from public.events where id = t;

    if src is not null and (p_include_text or p_include_creatives) then
      select to_jsonb(em) - 'id' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by' - 'published_at'
        into base
      from public.event_marketing em where em.event_id = t;
      base := coalesce(base, jsonb_build_object('status','draft'));

      merged := base;
      if p_include_text then merged := merged || src_text; end if;
      if p_include_creatives then merged := merged || src_creatives; end if;
      merged := merged || jsonb_build_object('event_id', t, 'company_id', v_company, 'created_at', now(), 'updated_at', now());

      delete from public.event_marketing where event_id = t;
      insert into public.event_marketing
        select (jsonb_populate_record(null::public.event_marketing, merged)).*;
      n_marketing := n_marketing + 1;
    end if;

    if p_include_faqs then
      delete from public.event_faqs where event_id = t;
      insert into public.event_faqs (company_id, event_id, question_pt, question_en, answer_pt, answer_en, category, display_order)
      select v_company, t, f.question_pt, f.question_en, f.answer_pt, f.answer_en, f.category, f.display_order
      from public.event_faqs f where f.event_id = p_source;
      get diagnostics c = row_count; n_faqs := n_faqs + c;
    end if;

    if p_include_lineup then
      delete from public.event_lineups where event_id = t;
      insert into public.event_lineups (company_id, event_id, artist_name, artist_image_url, artist_bio_pt, artist_bio_en, stage, performance_date, performance_time, display_order)
      select v_company, t, l.artist_name, l.artist_image_url, l.artist_bio_pt, l.artist_bio_en, l.stage, l.performance_date, l.performance_time, l.display_order
      from public.event_lineups l where l.event_id = p_source;
      get diagnostics c = row_count; n_lineup := n_lineup + c;
    end if;
  end loop;

  return jsonb_build_object(
    'targets', array_length(coalesce(p_targets,'{}'::uuid[]),1),
    'marketing_rows', n_marketing, 'faq_rows', n_faqs, 'lineup_rows', n_lineup
  );
end $function$

;

ALTER FUNCTION "public"."copy_event_tour_content"(p_source uuid, p_targets uuid[], p_include_text boolean, p_include_creatives boolean, p_include_faqs boolean, p_include_lineup boolean) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."copy_event_tour_content"(p_source uuid, p_targets uuid[], p_include_text boolean, p_include_creatives boolean, p_include_faqs boolean, p_include_lineup boolean) FROM PUBLIC;

DO $function_acl_reset$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"public"."copy_event_tour_content"(uuid, uuid[], boolean, boolean, boolean, boolean)'::regprocedure LOOP EXECUTE 'REVOKE ALL ON FUNCTION "public"."copy_event_tour_content"(p_source uuid, p_targets uuid[], p_include_text boolean, p_include_creatives boolean, p_include_faqs boolean, p_include_lineup boolean) FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $function_acl_reset$;

GRANT EXECUTE ON FUNCTION "public"."copy_event_tour_content"(p_source uuid, p_targets uuid[], p_include_text boolean, p_include_creatives boolean, p_include_faqs boolean, p_include_lineup boolean) TO PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."copy_event_tour_content"(p_source uuid, p_targets uuid[], p_include_text boolean, p_include_creatives boolean, p_include_faqs boolean, p_include_lineup boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."copy_event_tour_content"(p_source uuid, p_targets uuid[], p_include_text boolean, p_include_creatives boolean, p_include_faqs boolean, p_include_lineup boolean) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."copy_event_tour_content"(p_source uuid, p_targets uuid[], p_include_text boolean, p_include_creatives boolean, p_include_faqs boolean, p_include_lineup boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."copy_event_tour_content"(p_source uuid, p_targets uuid[], p_include_text boolean, p_include_creatives boolean, p_include_faqs boolean, p_include_lineup boolean) TO "service_role";
-- END OPERATION 779132612d4f99d82f2a7160a867911d8578b84a7fdca1556e0ea25922dcbe5a
