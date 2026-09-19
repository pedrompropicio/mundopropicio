-- D-ERP95 F2a — motor único de campanhas: alvo música (schema + RPCs de leitura/escrita)
-- Não altera o comportamento de eventos.

-- 1) Smart link por música
ALTER TABLE public.artist_songs
  ADD COLUMN IF NOT EXISTS smart_link_url text NULL;
ALTER TABLE public.artist_songs
  ADD CONSTRAINT artist_songs_smart_link_url_https
  CHECK (smart_link_url IS NULL OR smart_link_url ~ '^https://');

-- 2) design_id passa a ser exigido apenas no alvo evento
ALTER TABLE crm.meta_publish_plan ALTER COLUMN design_id DROP NOT NULL;
ALTER TABLE crm.meta_publish_plan
  ADD CONSTRAINT meta_publish_plan_event_needs_design
  CHECK (event_id IS NULL OR design_id IS NOT NULL);

-- 3) RPCs ------------------------------------------------------------------

-- Guard de escrita: sessão obrigatória + papel na empresa do artista.
CREATE OR REPLACE FUNCTION public.artist_ads_assert_write(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessão obrigatória' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(v_uid,'platform_admin'::app_role) THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.company_id = p_company_id
      AND ur.role IN ('admin','manager','marketing_manager')
  ) THEN RETURN; END IF;
  RAISE EXCEPTION 'sem permissão para gerir tráfego deste artista' USING ERRCODE = '42501';
END $$;

-- 3.1 Tetos de orçamento por connection de artista
CREATE OR REPLACE FUNCTION public.artist_ads_budget_cap_get(p_artist_id uuid)
RETURNS TABLE (
  platform text, connection_id uuid, account_id text, account_name text,
  account_currency text, status text,
  has_cap boolean, daily_cap numeric, cap_currency text, set_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public','crm'
AS $$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_ads_assert_access(p_artist_id);
  RETURN QUERY
  SELECT c.platform, c.id, c.selected_ad_account_id, c.selected_ad_account_name,
         c.selected_ad_account_currency, c.status,
         (b.id IS NOT NULL), b.daily_cap, b.currency, b.set_at
  FROM crm.ad_platform_connections c
  LEFT JOIN crm.artist_ads_budget_caps b ON b.connection_id = c.id
  WHERE c.connection_scope = 'artist'
    AND c.artist_id = p_artist_id
    AND c.company_id = v_company
  ORDER BY c.platform, c.selected_ad_account_id;
END $$;

-- 3.2 Lista de planos de alvo música
CREATE OR REPLACE FUNCTION public.artist_ads_plan_list(p_artist_id uuid)
RETURNS TABLE (
  id uuid, platform text, song_id uuid, song_title text,
  objetivo text, orcamento_total_cents bigint, moeda text, estado text,
  start_time timestamptz, end_time timestamptz, created_at timestamptz,
  external_campaign_id text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public','crm'
AS $$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_ads_assert_access(p_artist_id);
  RETURN QUERY
  SELECT p.id, 'meta'::text, p.song_id, s.title,
         p.objetivo, p.orcamento_total_cents, p.moeda, p.estado,
         p.start_time, p.end_time, p.created_at, p.meta_campaign_id
  FROM crm.meta_publish_plan p
  LEFT JOIN public.artist_songs s ON s.id = p.song_id
  WHERE p.artist_id = p_artist_id
    AND p.song_id IS NOT NULL
    AND p.company_id = v_company
  ORDER BY p.created_at DESC;
END $$;

-- 3.3 Plano completo
CREATE OR REPLACE FUNCTION public.artist_ads_plan_get(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public','crm'
AS $$
DECLARE v_company uuid; v_artist uuid; v_out jsonb;
BEGIN
  SELECT artist_id INTO v_artist FROM crm.meta_publish_plan
  WHERE id = p_plan_id AND song_id IS NOT NULL;
  IF v_artist IS NULL THEN
    RAISE EXCEPTION 'plano de alvo música inexistente' USING ERRCODE = '22023';
  END IF;
  v_company := public.artist_ads_assert_access(v_artist);

  SELECT to_jsonb(p) || jsonb_build_object(
           'platform','meta',
           'song_title', s.title,
           'song_smart_link_url', s.smart_link_url,
           'connection', jsonb_build_object(
             'id', c.id, 'platform', c.platform, 'status', c.status,
             'ad_account_id', c.selected_ad_account_id,
             'ad_account_name', c.selected_ad_account_name,
             'currency', c.selected_ad_account_currency)
         ) - 'publish_error'
    INTO v_out
  FROM crm.meta_publish_plan p
  LEFT JOIN public.artist_songs s ON s.id = p.song_id
  LEFT JOIN crm.ad_platform_connections c ON c.id = p.connection_id
  WHERE p.id = p_plan_id AND p.company_id = v_company;

  IF v_out IS NULL THEN
    RAISE EXCEPTION 'plano fora do âmbito' USING ERRCODE = '42501';
  END IF;
  RETURN v_out;
END $$;

-- 3.4 Posts promovíveis ("post existente")
CREATE OR REPLACE FUNCTION public.artist_ads_promotable_posts(p_artist_id uuid)
RETURNS TABLE (
  source text, platform text, post_ref text, post_kind text,
  permalink text, thumbnail_url text, caption_excerpt text,
  published_at timestamptz, song_id uuid, meta_ready boolean,
  last_ad_name text, spend_30d_cents bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public','crm'
AS $$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_ads_assert_access(p_artist_id);

  RETURN QUERY
  WITH conns AS (
    SELECT c.id FROM crm.ad_platform_connections c
    WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id
      AND c.company_id = v_company AND c.platform = 'meta'
  ),
  ads AS (
    SELECT s.external_ad_id, s.name AS ad_name, s.updated_time,
           s.raw->'creative'->>'effective_object_story_id'     AS osi,
           s.raw->'creative'->>'effective_instagram_media_id'  AS igid,
           s.raw->'creative'->>'instagram_permalink_url'       AS permalink,
           s.raw->'creative'->>'thumbnail_url'                 AS thumb
    FROM crm.meta_ad_snapshot s
    JOIN conns c ON c.id = s.connection_id
  ),
  refs AS (
    SELECT *, coalesce(osi, igid) AS post_ref,
           CASE WHEN osi IS NOT NULL THEN 'object_story' ELSE 'instagram_media' END AS post_kind
    FROM ads WHERE coalesce(osi, igid) IS NOT NULL
  ),
  spend AS (
    SELECT i.external_ad_id, sum(i.spend_cents)::bigint AS sc
    FROM crm.meta_ad_insights_daily i
    JOIN conns c ON c.id = i.connection_id
    WHERE i.date_start >= (current_date - INTERVAL '30 days')
    GROUP BY 1
  ),
  hist AS (
    SELECT DISTINCT ON (r.post_ref)
           r.post_ref, r.post_kind, r.permalink, r.thumb, r.ad_name
    FROM refs r
    ORDER BY r.post_ref, r.updated_time DESC NULLS LAST
  ),
  hist_spend AS (
    SELECT r.post_ref, sum(coalesce(sp.sc,0))::bigint AS sc
    FROM refs r LEFT JOIN spend sp ON sp.external_ad_id = r.external_ad_id
    GROUP BY 1
  ),
  hist_out AS (
    SELECT 'ad_history'::text AS source, 'meta'::text AS platform,
           h.post_ref, h.post_kind, h.permalink, h.thumb AS thumbnail_url,
           NULL::text AS caption_excerpt, NULL::timestamptz AS published_at,
           NULL::uuid AS song_id, true AS meta_ready,
           h.ad_name AS last_ad_name, coalesce(hs.sc,0)::bigint AS spend_30d_cents
    FROM hist h LEFT JOIN hist_spend hs ON hs.post_ref = h.post_ref
  ),
  content_out AS (
    SELECT 'artist_content'::text, 'meta'::text,
           ac.external_id, 'instagram_media'::text,
           ac.permalink, ac.thumbnail_url, ac.caption_excerpt, ac.published_at,
           ac.song_id,
           (ac.source = 'platform_api' AND ac.external_id ~ '^[0-9]{10,}$') AS meta_ready,
           NULL::text, 0::bigint
    FROM public.artist_content ac
    WHERE ac.artist_id = p_artist_id AND ac.company_id = v_company
      AND ac.platform = 'instagram'
      AND ac.external_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM hist_out h WHERE h.post_ref = ac.external_id)
  )
  SELECT * FROM hist_out
  UNION ALL
  SELECT * FROM content_out;
END $$;

-- 3.5 Smart link da música
CREATE OR REPLACE FUNCTION public.artist_ads_song_set_smart_link(p_song_id uuid, p_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','crm'
AS $$
DECLARE v_artist uuid; v_company uuid; v_url text := nullif(btrim(coalesce(p_url,'')), '');
BEGIN
  SELECT artist_id INTO v_artist FROM public.artist_songs WHERE id = p_song_id;
  IF v_artist IS NULL THEN
    RAISE EXCEPTION 'música inexistente' USING ERRCODE = '22023';
  END IF;
  v_company := public.artist_ads_assert_access(v_artist);
  PERFORM public.artist_ads_assert_write(v_company);
  IF v_url IS NOT NULL AND v_url !~ '^https://' THEN
    RAISE EXCEPTION 'o smart link tem de começar por https://' USING ERRCODE = '22023';
  END IF;
  UPDATE public.artist_songs SET smart_link_url = v_url, updated_at = now()
  WHERE id = p_song_id AND company_id = v_company;
END $$;

-- Validação partilhada do jsonb do plano de música.
CREATE OR REPLACE FUNCTION public.artist_ads_plan_validate(p_plan jsonb, p_smart_link text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE v_obj text; v_link text; v_adsets jsonb; v_a jsonb; v_n int := 0;
BEGIN
  IF p_plan IS NULL OR jsonb_typeof(p_plan) <> 'object' THEN
    RAISE EXCEPTION 'plano inválido' USING ERRCODE = '22023';
  END IF;
  v_obj := upper(coalesce(p_plan->>'objetivo',''));
  IF v_obj NOT IN ('AWARENESS','TRAFFIC','ENGAGEMENT') THEN
    RAISE EXCEPTION 'objetivo inválido: usa AWARENESS, TRAFFIC ou ENGAGEMENT (conversões não são aceites em campanhas de música)' USING ERRCODE = '22023';
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
  END LOOP;
  v_link := nullif(btrim(coalesce(p_plan->>'link_destino','')), '');
  IF v_link IS NULL THEN v_link := p_smart_link; END IF;
  IF v_obj = 'TRAFFIC' AND (v_link IS NULL OR v_link !~ '^https://') THEN
    RAISE EXCEPTION 'objetivo Tráfego exige link de destino https:// (no plano ou no smart link da música)' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('objetivo', v_obj, 'link_destino', v_link, 'adsets', v_adsets);
END $$;

-- 3.6 Criar plano de alvo música
CREATE OR REPLACE FUNCTION public.artist_ads_plan_create(
  p_artist_id uuid, p_song_id uuid, p_connection_id uuid, p_plan jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','crm'
AS $$
DECLARE v_company uuid; v_conn crm.ad_platform_connections; v_smart text; v_ok jsonb; v_id uuid;
BEGIN
  v_company := public.artist_ads_assert_access(p_artist_id);
  PERFORM public.artist_ads_assert_write(v_company);

  SELECT * INTO v_conn FROM crm.ad_platform_connections
  WHERE id = p_connection_id AND connection_scope = 'artist'
    AND artist_id = p_artist_id AND company_id = v_company;
  IF v_conn.id IS NULL THEN
    RAISE EXCEPTION 'ligação de anúncios do artista inexistente ou fora do âmbito' USING ERRCODE = '42501';
  END IF;
  IF v_conn.selected_ad_account_currency IS NULL THEN
    RAISE EXCEPTION 'a ligação não tem moeda da conta de anúncios definida' USING ERRCODE = '22023';
  END IF;

  SELECT smart_link_url INTO v_smart FROM public.artist_songs WHERE id = p_song_id;
  v_ok := public.artist_ads_plan_validate(p_plan, v_smart);

  INSERT INTO crm.meta_publish_plan (
    company_id, event_id, design_id, artist_id, song_id, connection_id,
    objetivo, orcamento_total_cents, moeda, link_destino,
    adsets, resumo, estado, created_by, start_time, end_time)
  VALUES (
    v_company, NULL, NULL, p_artist_id, p_song_id, p_connection_id,
    v_ok->>'objetivo',
    nullif(p_plan->>'orcamento_total_cents','')::bigint,
    v_conn.selected_ad_account_currency,
    v_ok->>'link_destino',
    v_ok->'adsets',
    p_plan->'resumo',
    'rascunho', auth.uid(),
    nullif(p_plan->>'start_time','')::timestamptz,
    nullif(p_plan->>'end_time','')::timestamptz)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- 3.7 Actualizar plano de alvo música (só rascunho/falhado)
CREATE OR REPLACE FUNCTION public.artist_ads_plan_update(p_plan_id uuid, p_plan jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','crm'
AS $$
DECLARE v_p crm.meta_publish_plan; v_company uuid; v_smart text; v_ok jsonb;
BEGIN
  SELECT * INTO v_p FROM crm.meta_publish_plan
  WHERE id = p_plan_id AND song_id IS NOT NULL;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'plano de alvo música inexistente' USING ERRCODE = '22023';
  END IF;
  v_company := public.artist_ads_assert_access(v_p.artist_id);
  PERFORM public.artist_ads_assert_write(v_company);
  IF v_p.company_id <> v_company THEN
    RAISE EXCEPTION 'plano fora do âmbito' USING ERRCODE = '42501';
  END IF;
  IF v_p.estado NOT IN ('rascunho','falhado') THEN
    RAISE EXCEPTION 'só é possível editar planos em rascunho ou falhados (estado: %)', v_p.estado USING ERRCODE = '22023';
  END IF;

  SELECT smart_link_url INTO v_smart FROM public.artist_songs WHERE id = v_p.song_id;
  v_ok := public.artist_ads_plan_validate(p_plan, v_smart);

  UPDATE crm.meta_publish_plan SET
    objetivo = v_ok->>'objetivo',
    orcamento_total_cents = nullif(p_plan->>'orcamento_total_cents','')::bigint,
    link_destino = v_ok->>'link_destino',
    adsets = v_ok->'adsets',
    resumo = coalesce(p_plan->'resumo', resumo),
    start_time = nullif(p_plan->>'start_time','')::timestamptz,
    end_time = nullif(p_plan->>'end_time','')::timestamptz,
    updated_at = now()
  WHERE id = p_plan_id;
  RETURN p_plan_id;
END $$;

-- 4) Privilégios (regra D-ERP94) ------------------------------------------
REVOKE EXECUTE ON FUNCTION public.artist_ads_assert_write(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_budget_cap_get(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_plan_list(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_plan_get(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_promotable_posts(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_song_set_smart_link(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_plan_validate(jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_plan_create(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_plan_update(uuid, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.artist_ads_assert_write(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_budget_cap_get(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_plan_list(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_plan_get(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_promotable_posts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_song_set_smart_link(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_plan_validate(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_plan_create(uuid, uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_plan_update(uuid, jsonb) TO authenticated, service_role;