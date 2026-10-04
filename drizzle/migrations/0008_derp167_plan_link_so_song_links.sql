-- D-ERP167 (passo 1): a origem do link de destino é só public.song_links.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.artist_ads_plan_create(p_artist_id uuid, p_song_id uuid, p_connection_id uuid, p_plan jsonb, p_platform text DEFAULT 'meta'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_company uuid; v_conn crm.ad_platform_connections; v_smart text; v_ok jsonb; v_id uuid;
BEGIN
  IF p_platform NOT IN ('meta','tiktok','google') THEN
    RAISE EXCEPTION 'plataforma não suportada' USING ERRCODE = '22023';
  END IF;

  v_company := public.artist_ads_assert_access(p_artist_id);
  PERFORM public.artist_ads_assert_write(v_company);

  SELECT * INTO v_conn FROM crm.ad_platform_connections
  WHERE id = p_connection_id AND connection_scope = 'artist'
    AND artist_id = p_artist_id AND company_id = v_company;
  IF v_conn.id IS NULL THEN
    RAISE EXCEPTION 'ligação de anúncios do artista inexistente ou fora do âmbito' USING ERRCODE = '42501';
  END IF;
  IF v_conn.platform IS DISTINCT FROM p_platform THEN
    RAISE EXCEPTION 'a ligação não é da plataforma indicada' USING ERRCODE = '22023';
  END IF;
  IF v_conn.selected_ad_account_currency IS NULL THEN
    RAISE EXCEPTION 'a ligação não tem moeda da conta de anúncios definida' USING ERRCODE = '22023';
  END IF;

  -- D-ERP167: só o smart link MP activo da música (song_links).
  SELECT 'https://www.mundopropicio.com/m/' || l.slug INTO v_smart
  FROM public.song_links l
  WHERE l.song_id = p_song_id AND l.active AND l.company_id = v_company
  ORDER BY l.updated_at DESC LIMIT 1;
  v_ok := public.artist_ads_plan_validate(p_plan, v_smart);

  INSERT INTO crm.meta_publish_plan (
    company_id, event_id, design_id, artist_id, song_id, connection_id, platform,
    objetivo, orcamento_total_cents, moeda, link_destino,
    adsets, resumo, estado, created_by, start_time, end_time)
  VALUES (
    v_company, NULL, NULL, p_artist_id, p_song_id, p_connection_id, p_platform,
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
END $function$;

CREATE OR REPLACE FUNCTION public.artist_ads_plan_get(p_plan_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_company uuid; v_artist uuid; v_out jsonb;
BEGIN
  SELECT artist_id INTO v_artist FROM crm.meta_publish_plan
  WHERE id = p_plan_id AND song_id IS NOT NULL;
  IF v_artist IS NULL THEN
    RAISE EXCEPTION 'plano de alvo música inexistente' USING ERRCODE = '22023';
  END IF;
  v_company := public.artist_ads_assert_access(v_artist);

  -- D-ERP167: song_smart_link_url mantém a chave, mas vem de song_links.
  SELECT to_jsonb(p) || jsonb_build_object(
           'platform','meta',
           'song_title', s.title,
           'song_smart_link_url', (
             SELECT 'https://www.mundopropicio.com/m/' || l.slug
             FROM public.song_links l
             WHERE l.song_id = p.song_id AND l.active AND l.company_id = v_company
             ORDER BY l.updated_at DESC LIMIT 1),
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
END $function$;

CREATE OR REPLACE FUNCTION public.artist_ads_plan_update(p_plan_id uuid, p_plan jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
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

  -- D-ERP167: só o smart link MP activo da música (song_links).
  SELECT 'https://www.mundopropicio.com/m/' || l.slug INTO v_smart
  FROM public.song_links l
  WHERE l.song_id = v_p.song_id AND l.active AND l.company_id = v_company
  ORDER BY l.updated_at DESC LIMIT 1;
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
END $function$;

REVOKE ALL ON FUNCTION public.artist_ads_plan_create(uuid,uuid,uuid,jsonb,text), public.artist_ads_plan_get(uuid), public.artist_ads_plan_update(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_plan_create(uuid,uuid,uuid,jsonb,text), public.artist_ads_plan_get(uuid), public.artist_ads_plan_update(uuid,jsonb) TO authenticated, service_role;
