-- D-ERP95 (adenda 24/09/2026): publico_sugerido aceita interesses, públicos personalizados/excluídos,
-- posicionamentos e idade 13–65. Aqui só a forma; a existência na Meta é verificada no preflight/publicação.
-- D-ERP141 (adenda): smart links com pixel TikTok (Events API).
CREATE OR REPLACE FUNCTION public.artist_ads_plan_validate(p_plan jsonb, p_smart_link text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_obj text; v_link text; v_adsets jsonb; v_a jsonb; v_n int := 0; v_geo jsonb;
  v_pub jsonb; v_k text; v_x jsonb; v_min numeric; v_max numeric; v_pos jsonb;
BEGIN
  IF p_plan IS NULL OR jsonb_typeof(p_plan) <> 'object' THEN
    RAISE EXCEPTION 'plano inválido' USING ERRCODE = '22023';
  END IF;
  v_obj := upper(coalesce(p_plan->>'objetivo',''));
  -- Meta: AWARENESS/TRAFFIC/ENGAGEMENT; TikTok: REACH/VIDEO_VIEWS/TRAFFIC (D-ERP107)
  IF v_obj NOT IN ('AWARENESS','TRAFFIC','ENGAGEMENT','REACH','VIDEO_VIEWS') THEN
    RAISE EXCEPTION 'objetivo inválido: usa AWARENESS, TRAFFIC ou ENGAGEMENT (Meta) ou REACH, VIDEO_VIEWS ou TRAFFIC (TikTok); conversões não são aceites em campanhas de música' USING ERRCODE = '22023';
  END IF;
  v_adsets := p_plan->'adsets';
  IF v_adsets IS NULL OR jsonb_typeof(v_adsets) <> 'array' OR jsonb_array_length(v_adsets) < 1 THEN
    RAISE EXCEPTION 'o plano precisa de pelo menos um conjunto de anúncios' USING ERRCODE = '22023';
  END IF;
  FOR v_a IN SELECT * FROM jsonb_array_elements(v_adsets) LOOP
    v_n := v_n + 1;
    IF coalesce((v_a->>'orcamento_cents')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'conjunto %: orçamento diário tem de ser maior que zero', v_n USING ERRCODE = '22023';
    END IF;
    IF v_a->'anuncios' IS NULL OR jsonb_typeof(v_a->'anuncios') <> 'array'
       OR jsonb_array_length(v_a->'anuncios') < 1 THEN
      RAISE EXCEPTION 'conjunto %: precisa de pelo menos um anúncio', v_n USING ERRCODE = '22023';
    END IF;
    v_geo := v_a->'publico_sugerido'->'geo';
    IF v_geo IS NULL OR jsonb_typeof(v_geo) <> 'array'
       OR NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(v_geo) g
         WHERE btrim(coalesce(g, '')) <> ''
       ) THEN
      RAISE EXCEPTION 'conjunto %: indica pelo menos um país em publico_sugerido.geo (ex.: ["BR"])', v_n USING ERRCODE = '22023';
    END IF;
    v_pub := v_a->'publico_sugerido';
    -- Idade 13–65 (opcional)
    IF v_pub ? 'idade_min' THEN
      IF jsonb_typeof(v_pub->'idade_min') <> 'number' THEN RAISE EXCEPTION 'conjunto %: idade_min tem de ser número', v_n USING ERRCODE='22023'; END IF;
      v_min := (v_pub->>'idade_min')::numeric;
      IF v_min < 13 OR v_min > 65 THEN RAISE EXCEPTION 'conjunto %: idade_min entre 13 e 65', v_n USING ERRCODE='22023'; END IF;
    END IF;
    IF v_pub ? 'idade_max' THEN
      IF jsonb_typeof(v_pub->'idade_max') <> 'number' THEN RAISE EXCEPTION 'conjunto %: idade_max tem de ser número', v_n USING ERRCODE='22023'; END IF;
      v_max := (v_pub->>'idade_max')::numeric;
      IF v_max < 13 OR v_max > 65 THEN RAISE EXCEPTION 'conjunto %: idade_max entre 13 e 65', v_n USING ERRCODE='22023'; END IF;
      IF v_min IS NOT NULL AND v_min > v_max THEN RAISE EXCEPTION 'conjunto %: idade_min maior que idade_max', v_n USING ERRCODE='22023'; END IF;
    END IF;
    v_min := NULL; v_max := NULL;
    -- Listas [{id, nome}] com id numérico
    FOREACH v_k IN ARRAY ARRAY['interesses','publicos_personalizados','publicos_excluidos'] LOOP
      IF v_pub ? v_k THEN
        IF jsonb_typeof(v_pub->v_k) <> 'array' THEN
          RAISE EXCEPTION 'conjunto %: publico_sugerido.% tem de ser lista [{id, nome}]', v_n, v_k USING ERRCODE='22023';
        END IF;
        FOR v_x IN SELECT * FROM jsonb_array_elements(v_pub->v_k) LOOP
          IF jsonb_typeof(v_x) <> 'object' OR coalesce(v_x->>'id','') !~ '^[0-9]+$' THEN
            RAISE EXCEPTION 'conjunto %: publico_sugerido.% com id inválido (%)', v_n, v_k, left(v_x::text, 80) USING ERRCODE='22023';
          END IF;
        END LOOP;
      END IF;
    END LOOP;
    -- Posicionamentos (opcional)
    IF v_pub ? 'posicionamentos' THEN
      v_pos := v_pub->'posicionamentos';
      IF jsonb_typeof(v_pos) <> 'object' THEN RAISE EXCEPTION 'conjunto %: posicionamentos tem de ser objeto', v_n USING ERRCODE='22023'; END IF;
      IF v_pos ? 'publisher_platforms' AND (jsonb_typeof(v_pos->'publisher_platforms') <> 'array' OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(v_pos->'publisher_platforms') p
          WHERE p NOT IN ('facebook','instagram','messenger','audience_network','threads'))) THEN
        RAISE EXCEPTION 'conjunto %: publisher_platforms inválido', v_n USING ERRCODE='22023';
      END IF;
      IF v_pos ? 'instagram_positions' AND (jsonb_typeof(v_pos->'instagram_positions') <> 'array' OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(v_pos->'instagram_positions') p
          WHERE p NOT IN ('stream','story','explore','explore_home','reels','profile_feed','ig_search','profile_reels'))) THEN
        RAISE EXCEPTION 'conjunto %: instagram_positions inválido', v_n USING ERRCODE='22023';
      END IF;
      IF v_pos ? 'facebook_positions' AND (jsonb_typeof(v_pos->'facebook_positions') <> 'array' OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(v_pos->'facebook_positions') p
          WHERE p NOT IN ('feed','right_hand_column','marketplace','video_feeds','story','search','instream_video','facebook_reels','facebook_reels_overlay','profile_feed','notification'))) THEN
        RAISE EXCEPTION 'conjunto %: facebook_positions inválido', v_n USING ERRCODE='22023';
      END IF;
    END IF;
  END LOOP;
  v_link := nullif(btrim(coalesce(p_plan->>'link_destino','')), '');
  IF v_link IS NULL THEN v_link := p_smart_link; END IF;
  IF v_obj = 'TRAFFIC' AND (v_link IS NULL OR v_link !~ '^https://') THEN
    RAISE EXCEPTION 'objetivo Tráfego exige link de destino https:// (no plano ou no smart link da música)' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('objetivo', v_obj, 'link_destino', v_link, 'adsets', v_adsets);
END $function$;

REVOKE EXECUTE ON FUNCTION public.artist_ads_plan_validate(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_plan_validate(jsonb, text) TO authenticated, service_role;

-- B) TikTok Events API nos smart links
ALTER TABLE public.song_links ADD COLUMN IF NOT EXISTS tiktok_pixel_id text;
ALTER TABLE public.song_link_events ADD COLUMN IF NOT EXISTS tiktok_status text;

DROP FUNCTION IF EXISTS public.song_link_public_get(text);
CREATE FUNCTION public.song_link_public_get(p_slug text)
 RETURNS TABLE(slug text, default_mode text, title text, cover_url text, destinations jsonb, meta_pixel_id text, active boolean, tiktok_pixel_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT l.slug, l.default_mode, l.title, l.cover_url, l.destinations, l.meta_pixel_id, l.active, l.tiktok_pixel_id
  FROM public.song_links l
  WHERE l.slug = lower(btrim(coalesce(p_slug,''))) AND l.active
$function$;
REVOKE ALL ON FUNCTION public.song_link_public_get(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.song_link_public_get(text) TO anon, authenticated, service_role;