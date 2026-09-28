CREATE TABLE public.artist_ads_campaign_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta','google','tiktok')),
  external_campaign_id text NOT NULL,
  nivel text NOT NULL DEFAULT 'campaign' CHECK (nivel IN ('campaign','adgroup')),
  external_adgroup_id text NULL,
  resultado_nome text NOT NULL,
  meta_tipo text NOT NULL CHECK (meta_tipo IN ('custo_por_resultado','volume')),
  meta_valor numeric NOT NULL,
  moeda text NOT NULL,
  valido_desde date NOT NULL DEFAULT current_date,
  origem text NOT NULL CHECK (origem IN ('pedro','plano')),
  notas text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX artist_ads_campaign_goals_uq ON public.artist_ads_campaign_goals
  (company_id, platform, external_campaign_id, nivel, external_adgroup_id, valido_desde) NULLS NOT DISTINCT;
CREATE INDEX artist_ads_campaign_goals_artist_idx ON public.artist_ads_campaign_goals (artist_id);

GRANT SELECT ON public.artist_ads_campaign_goals TO authenticated;
GRANT ALL ON public.artist_ads_campaign_goals TO service_role;
ALTER TABLE public.artist_ads_campaign_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goals_select_company_members" ON public.artist_ads_campaign_goals
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'platform_admin'::app_role)
         OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.company_id = artist_ads_campaign_goals.company_id));

CREATE TRIGGER trg_artist_ads_campaign_goals_updated_at BEFORE UPDATE ON public.artist_ads_campaign_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.artist_ads_campaign_goal_upsert(
  p_artist_id uuid, p_platform text, p_external_campaign_id text, p_nivel text,
  p_external_adgroup_id text, p_resultado_nome text, p_meta_tipo text, p_meta_valor numeric,
  p_moeda text, p_notas text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_id uuid; v_nivel text := coalesce(nullif(p_nivel,''),'campaign');
BEGIN
  v_company := public.artist_ads_assert_access(p_artist_id);
  PERFORM public.artist_ads_assert_write(v_company);
  IF nullif(trim(p_external_campaign_id),'') IS NULL THEN RAISE EXCEPTION 'campanha obrigatória' USING ERRCODE='22023'; END IF;
  IF p_meta_valor IS NULL OR p_meta_valor <= 0 THEN RAISE EXCEPTION 'meta_valor tem de ser > 0' USING ERRCODE='22023'; END IF;
  IF v_nivel = 'adgroup' AND nullif(trim(p_external_adgroup_id),'') IS NULL THEN
    RAISE EXCEPTION 'nível adgroup exige external_adgroup_id' USING ERRCODE='22023'; END IF;
  UPDATE public.artist_ads_campaign_goals SET
    resultado_nome = p_resultado_nome, meta_tipo = p_meta_tipo, meta_valor = p_meta_valor,
    moeda = upper(p_moeda), notas = p_notas, origem = 'pedro', artist_id = p_artist_id
  WHERE company_id = v_company AND platform = p_platform AND external_campaign_id = p_external_campaign_id
    AND nivel = v_nivel AND external_adgroup_id IS NOT DISTINCT FROM nullif(trim(p_external_adgroup_id),'')
    AND valido_desde = current_date
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    INSERT INTO public.artist_ads_campaign_goals (company_id, artist_id, platform, external_campaign_id, nivel,
      external_adgroup_id, resultado_nome, meta_tipo, meta_valor, moeda, origem, notas)
    VALUES (v_company, p_artist_id, p_platform, p_external_campaign_id, v_nivel,
      nullif(trim(p_external_adgroup_id),''), p_resultado_nome, p_meta_tipo, p_meta_valor, upper(p_moeda), 'pedro', p_notas)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.artist_ads_campaign_goal_list(p_artist_id uuid)
RETURNS SETOF public.artist_ads_campaign_goals LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_ads_assert_access(p_artist_id);
  RETURN QUERY SELECT * FROM public.artist_ads_campaign_goals g
   WHERE g.artist_id = p_artist_id AND g.company_id = v_company
   ORDER BY g.platform, g.external_campaign_id, g.valido_desde DESC;
END $$;

REVOKE ALL ON FUNCTION public.artist_ads_campaign_goal_upsert(uuid,text,text,text,text,text,text,numeric,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artist_ads_campaign_goal_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_campaign_goal_upsert(uuid,text,text,text,text,text,text,numeric,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_campaign_goal_list(uuid) TO authenticated, service_role;

ALTER TABLE crm.tiktok_insights_daily ADD COLUMN IF NOT EXISTS view_content integer NULL;
ALTER TABLE crm.tiktok_insights_daily ADD COLUMN IF NOT EXISTS button_click integer NULL;

CREATE OR REPLACE FUNCTION crm.tiktok_manual_upsert_core(p_connection_id uuid, p_payload jsonb, p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE
  v_conn record;
  v_camp jsonb := coalesce(p_payload->'campanha', '{}'::jsonb);
  v_cid text; v_name text; v_song uuid; v_currency text; v_existing_src text;
  g jsonb; d jsonb;
  v_level text; v_ext text; v_date date; v_spend numeric; v_src text;
  n_camp int := 0; n_camp_skip int := 0; n_grp int := 0; n_grp_skip int := 0;
  n_day_ins int := 0; n_day_upd int := 0; n_day_skip int := 0;
  k text;
BEGIN
  SELECT * INTO v_conn FROM crm.ad_platform_connections WHERE id = p_connection_id;
  IF NOT FOUND OR v_conn.platform <> 'tiktok' OR v_conn.connection_scope <> 'artist' THEN
    RAISE EXCEPTION 'ligação TikTok de artista não encontrada' USING ERRCODE = '22023';
  END IF;

  v_currency := v_conn.selected_ad_account_currency;
  v_name := nullif(trim(v_camp->>'name'), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'campanha.name obrigatório' USING ERRCODE = '22023';
  END IF;
  IF (v_camp->>'budget_cents') IS NOT NULL AND (v_camp->>'budget_cents')::numeric < 0 THEN
    RAISE EXCEPTION 'campanha.budget_cents negativo' USING ERRCODE = '22023';
  END IF;
  v_song := nullif(v_camp->>'song_id','')::uuid;
  IF v_song IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.artist_songs s WHERE s.id = v_song AND s.artist_id = v_conn.artist_id
  ) THEN
    RAISE EXCEPTION 'song_id não pertence ao artista da ligação' USING ERRCODE = '22023';
  END IF;

  v_cid := nullif(trim(v_camp->>'external_campaign_id'), '');
  IF v_cid IS NULL THEN
    SELECT external_campaign_id INTO v_cid FROM crm.tiktok_campaign
     WHERE connection_id = p_connection_id AND source = 'api' AND name = v_name
     ORDER BY last_synced_at DESC LIMIT 1;
  END IF;
  IF v_cid IS NULL THEN
    v_cid := 'manual:' || public.tiktok_manual_slug(v_name);
  END IF;

  SELECT source INTO v_existing_src FROM crm.tiktok_campaign
   WHERE connection_id = p_connection_id AND external_campaign_id = v_cid;
  IF v_existing_src = 'api' THEN
    n_camp_skip := 1;
  ELSE
    INSERT INTO crm.tiktok_campaign (company_id, connection_id, external_campaign_id, name, status,
      objective, budget_cents, currency, source, last_synced_at, raw)
    VALUES (v_conn.company_id, p_connection_id, v_cid, v_name, v_camp->>'status', v_camp->>'objective',
      (v_camp->>'budget_cents')::bigint, v_currency, 'manual', now(), v_camp)
    ON CONFLICT (connection_id, external_campaign_id) DO UPDATE SET
      name = EXCLUDED.name, status = EXCLUDED.status, objective = EXCLUDED.objective,
      budget_cents = EXCLUDED.budget_cents, currency = EXCLUDED.currency,
      last_synced_at = now(), raw = EXCLUDED.raw
    WHERE crm.tiktok_campaign.source = 'manual';
    n_camp := 1;
  END IF;
  IF v_song IS NOT NULL THEN
    UPDATE crm.tiktok_campaign SET linked_song_id = v_song, linked_song_locked = true
     WHERE connection_id = p_connection_id AND external_campaign_id = v_cid;
  END IF;

  FOR g IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'grupos','[]'::jsonb)) LOOP
    v_ext := nullif(trim(g->>'external_adgroup_id'), '');
    IF v_ext IS NULL THEN
      RAISE EXCEPTION 'grupos[].external_adgroup_id obrigatório' USING ERRCODE = '22023';
    END IF;
    IF (g->>'budget_cents') IS NOT NULL AND (g->>'budget_cents')::numeric < 0 THEN
      RAISE EXCEPTION 'grupo % com budget_cents negativo', v_ext USING ERRCODE = '22023';
    END IF;
    SELECT source INTO v_src FROM crm.tiktok_adgroup WHERE connection_id = p_connection_id AND external_adgroup_id = v_ext;
    IF v_src = 'api' THEN
      n_grp_skip := n_grp_skip + 1;
    ELSE
      INSERT INTO crm.tiktok_adgroup (company_id, connection_id, external_campaign_id, external_adgroup_id,
        name, status, budget_cents, currency, source, last_synced_at, raw)
      VALUES (v_conn.company_id, p_connection_id, v_cid, v_ext, g->>'name', g->>'status',
        (g->>'budget_cents')::bigint, v_currency, 'manual', now(), g)
      ON CONFLICT (connection_id, external_adgroup_id) DO UPDATE SET
        external_campaign_id = EXCLUDED.external_campaign_id, name = EXCLUDED.name, status = EXCLUDED.status,
        budget_cents = EXCLUDED.budget_cents, currency = EXCLUDED.currency, last_synced_at = now(), raw = EXCLUDED.raw
      WHERE crm.tiktok_adgroup.source = 'manual';
      n_grp := n_grp + 1;
    END IF;
    v_src := NULL;
  END LOOP;

  FOR d IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'dias','[]'::jsonb)) LOOP
    v_level := coalesce(d->>'level', 'adgroup');
    IF v_level NOT IN ('campaign','adgroup') THEN
      RAISE EXCEPTION 'dias[].level inválido: %', v_level USING ERRCODE = '22023';
    END IF;
    v_date := (d->>'date')::date;
    IF v_date IS NULL OR v_date > current_date THEN
      RAISE EXCEPTION 'dias[].date inválida ou futura: %', d->>'date' USING ERRCODE = '22023';
    END IF;
    v_ext := coalesce(nullif(trim(d->>'external_id'),''), CASE WHEN v_level = 'campaign' THEN v_cid END);
    IF v_ext IS NULL THEN
      RAISE EXCEPTION 'dias[].external_id obrigatório no nível adgroup' USING ERRCODE = '22023';
    END IF;
    FOREACH k IN ARRAY ARRAY['spend','impressions','clicks','video_views_6s','video_views_2s','likes','follows','reach','view_content','button_click'] LOOP
      IF (d->>k) IS NOT NULL AND (d->>k)::numeric < 0 THEN
        RAISE EXCEPTION 'dias[].% negativo (%)', k, d->>'date' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_spend := (d->>'spend')::numeric;

    SELECT source INTO v_src FROM crm.tiktok_insights_daily
     WHERE connection_id = p_connection_id AND level = v_level AND external_id = v_ext AND date_start = v_date;
    IF v_src = 'api' THEN
      n_day_skip := n_day_skip + 1;
    ELSE
      IF v_src IS NULL THEN n_day_ins := n_day_ins + 1; ELSE n_day_upd := n_day_upd + 1; END IF;
      INSERT INTO crm.tiktok_insights_daily (company_id, connection_id, level, external_id, external_campaign_id,
        date_start, spend_cents, impressions, clicks, video_views_6s, video_views_2s, likes, follows, reach,
        view_content, button_click, currency, source, recorded_at, raw)
      VALUES (v_conn.company_id, p_connection_id, v_level, v_ext, v_cid, v_date,
        CASE WHEN v_spend IS NULL THEN NULL ELSE round(v_spend * 100)::bigint END,
        (d->>'impressions')::bigint, (d->>'clicks')::bigint, (d->>'video_views_6s')::bigint,
        (d->>'video_views_2s')::bigint, (d->>'likes')::bigint, (d->>'follows')::bigint, (d->>'reach')::bigint,
        (d->>'view_content')::integer, (d->>'button_click')::integer,
        v_currency, 'manual', now(), d || jsonb_build_object('gravado_por', p_actor))
      ON CONFLICT (connection_id, level, external_id, date_start) DO UPDATE SET
        external_campaign_id = EXCLUDED.external_campaign_id, spend_cents = EXCLUDED.spend_cents,
        impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, video_views_6s = EXCLUDED.video_views_6s,
        video_views_2s = EXCLUDED.video_views_2s, likes = EXCLUDED.likes, follows = EXCLUDED.follows,
        reach = EXCLUDED.reach,
        view_content = CASE WHEN d ? 'view_content' THEN EXCLUDED.view_content ELSE crm.tiktok_insights_daily.view_content END,
        button_click = CASE WHEN d ? 'button_click' THEN EXCLUDED.button_click ELSE crm.tiktok_insights_daily.button_click END,
        currency = EXCLUDED.currency, recorded_at = now(), raw = EXCLUDED.raw
      WHERE crm.tiktok_insights_daily.source = 'manual';
    END IF;
    v_src := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'external_campaign_id', v_cid,
    'campanha', jsonb_build_object('gravada', n_camp, 'ignorada_api', n_camp_skip),
    'grupos', jsonb_build_object('gravados', n_grp, 'ignorados_api', n_grp_skip),
    'dias', jsonb_build_object('inseridos', n_day_ins, 'atualizados', n_day_upd, 'ignorados_api', n_day_skip));
END;
$function$;

CREATE OR REPLACE FUNCTION public.artist_ads_campaign_key(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT replace(regexp_replace(regexp_replace(' '||public.artist_ads_norm(p_text)||' ',
    ' (de|da|do|dos|das|e) ', ' ', 'g'), ' (de|da|do|dos|das|e) ', ' ', 'g'), ' ', '')
$$;

CREATE OR REPLACE FUNCTION public.artist_ads_period_report(p_artist_id uuid, p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, crm AS $$
DECLARE
  v_company uuid; v_ref text; v_nome text; v_out jsonb; v_plat jsonb; v_mus jsonb; v_lac jsonb; v_tot jsonb;
BEGIN
  v_company := public.artist_ads_assert_access(p_artist_id);
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'período inválido' USING ERRCODE='22023'; END IF;
  IF p_to - p_from > 366 THEN RAISE EXCEPTION 'período máximo 366 dias' USING ERRCODE='22023'; END IF;

  SELECT a.name, coalesce(a.reporting_currency, co.currency, 'EUR') INTO v_nome, v_ref
  FROM public.artists a LEFT JOIN public.companies co ON co.id = a.company_id WHERE a.id = p_artist_id;

  WITH conns AS (
    SELECT c.id, c.platform, c.selected_ad_account_id, c.selected_ad_account_name, c.selected_ad_account_currency
    FROM crm.ad_platform_connections c
    WHERE c.connection_scope='artist' AND c.artist_id=p_artist_id AND c.company_id=v_company
  ),
  t_lv AS (
    SELECT i.*, bool_or(i.level='campaign') OVER (PARTITION BY i.connection_id, i.external_campaign_id, i.date_start) has_c
    FROM crm.tiktok_insights_daily i JOIN conns c ON c.id=i.connection_id AND c.platform='tiktok'
    WHERE i.level IN ('campaign','adgroup') AND i.date_start BETWEEN p_from AND p_to
  ),
  cd AS (
    SELECT 'meta'::text platform, i.connection_id, i.external_campaign_id cid, i.date_start dia,
      coalesce(i.currency,c.selected_ad_account_currency) currency, i.spend_cents/100.0 spend,
      i.impressions::numeric imp, i.clicks::numeric clk,
      i.video_3s_views::numeric m3s, i.video_thruplays::numeric mthru, i.video_p25_watched::numeric p25,
      i.video_p50_watched::numeric p50, i.video_p75_watched::numeric p75, i.video_p100_watched::numeric p100,
      NULL::numeric gviews, NULL::numeric t2s, NULL::numeric t6s, NULL::numeric likes, NULL::numeric follows,
      i.last_synced_at leitura, 'api'::text src
    FROM crm.meta_campaign_insights_daily i JOIN conns c ON c.id=i.connection_id AND c.platform='meta'
    WHERE i.date_start BETWEEN p_from AND p_to
    UNION ALL
    SELECT 'google', i.connection_id, i.external_campaign_id, i.date_start,
      coalesce(i.currency,c.selected_ad_account_currency), i.spend_cents/100.0, i.impressions, i.clicks,
      NULL,NULL,NULL,NULL,NULL,NULL,
      CASE WHEN coalesce(i.video_metrics->>'video_views', i.raw->>'video_views') ~ '^[0-9]+(\.0+)?$'
           THEN (coalesce(i.video_metrics->>'video_views', i.raw->>'video_views'))::numeric END,
      NULL,NULL,NULL,NULL, i.last_synced_at, 'api'
    FROM crm.google_campaign_insights_daily i JOIN conns c ON c.id=i.connection_id AND c.platform='google'
    WHERE i.date_start BETWEEN p_from AND p_to
    UNION ALL
    SELECT 'tiktok', i.connection_id, i.external_campaign_id, i.date_start,
      coalesce(max(i.currency),max(c.selected_ad_account_currency)), sum(i.spend_cents)/100.0, sum(i.impressions), sum(i.clicks),
      NULL,NULL,NULL,NULL,NULL,NULL,NULL,
      sum(i.video_views_2s), sum(i.video_views_6s), sum(i.likes), sum(i.follows),
      max(i.recorded_at), CASE WHEN bool_and(i.source='manual') THEN 'manual' ELSE 'api' END
    FROM t_lv i JOIN conns c ON c.id=i.connection_id
    WHERE (i.has_c AND i.level='campaign') OR (NOT i.has_c AND i.level='adgroup')
    GROUP BY i.connection_id, i.external_campaign_id, i.date_start
  ),
  cdr AS (
    SELECT cd.*, CASE WHEN coalesce(cd.spend,0)=0 THEN 0 ELSE public.fx_convert(cd.spend, cd.currency, v_ref, cd.dia) END spend_ref,
      (coalesce(cd.spend,0)>0 AND public.fx_convert(cd.spend, cd.currency, v_ref, cd.dia) IS NULL) fx_miss
    FROM cd
  ),
  cm AS (
    SELECT 'meta'::text platform, s.connection_id, s.external_campaign_id cid, s.name nome,
      coalesce(s.effective_status,s.status) st, s.objective objetivo,
      (SELECT string_agg(DISTINCT a.optimization_goal, ',') FROM crm.meta_adset_snapshot a
        WHERE a.connection_id=s.connection_id AND a.external_campaign_id=s.external_campaign_id) otimizacao,
      nullif(s.daily_budget_cents,0)/100.0 orc, s.linked_song_id song, s.last_synced_at leitura_meta
    FROM crm.meta_campaign_snapshot s JOIN conns c ON c.id=s.connection_id
    UNION ALL
    SELECT 'google', g.connection_id, g.external_campaign_id, g.name, g.status, g.advertising_channel_type,
      g.bidding_strategy_type, g.budget_amount_micros/1000000.0, g.linked_song_id, g.last_synced_at
    FROM crm.google_campaign g JOIN conns c ON c.id=g.connection_id
    UNION ALL
    SELECT 'tiktok', t.connection_id, t.external_campaign_id, t.name, t.status, t.objective,
      (SELECT string_agg(DISTINCT coalesce(ag.raw->>'optimization_goal', ag.raw->>'otimizacao'), ',') FROM crm.tiktok_adgroup ag
        WHERE ag.connection_id=t.connection_id AND ag.external_campaign_id=t.external_campaign_id),
      coalesce(nullif(t.budget_cents,0),
        (SELECT nullif(sum(ag.budget_cents),0) FROM crm.tiktok_adgroup ag
          WHERE ag.connection_id=t.connection_id AND ag.external_campaign_id=t.external_campaign_id
            AND upper(coalesce(ag.status,'')) IN ('ENABLE','ACTIVE')))/100.0,
      t.linked_song_id, t.last_synced_at
    FROM crm.tiktok_campaign t JOIN conns c ON c.id=t.connection_id
  ),
  agg AS (
    SELECT platform, connection_id, cid,
      max(currency) currency,
      min(dia) FILTER (WHERE spend>0) d0, max(dia) FILTER (WHERE spend>0) d1,
      min(dia) primeira_linha, max(dia) ultima_linha,
      count(DISTINCT dia) FILTER (WHERE spend>0) dias_entrega,
      round(sum(spend),2) gasto, round(sum(spend_ref),2) gasto_ref,
      count(*) FILTER (WHERE fx_miss) fx_missing,
      sum(imp) imp, sum(clk) clk,
      sum(m3s) m3s, sum(mthru) mthru, sum(p25) p25, sum(p50) p50, sum(p75) p75, sum(p100) p100,
      sum(gviews) gviews, sum(t2s) t2s, sum(t6s) t6s, sum(likes) likes, sum(follows) follows,
      max(leitura) leitura, CASE WHEN bool_and(src='manual') THEN 'manual' ELSE 'api' END src
    FROM cdr GROUP BY 1,2,3
  ),
  camp AS (
    SELECT a.*, m.nome, m.objetivo, m.otimizacao, m.orc, m.song, c.selected_ad_account_id account_id,
      CASE WHEN upper(coalesce(m.st,'')) IN ('ACTIVE','ENABLED','ENABLE','CAMPAIGN_STATUS_ENABLE') THEN 'ativo'
           WHEN upper(coalesce(m.st,'')) IN ('PAUSED','DISABLE','CAMPAIGN_PAUSED','ADSET_PAUSED','CAMPAIGN_STATUS_DISABLE') THEN 'pausado'
           WHEN upper(coalesce(m.st,'')) IN ('REMOVED','DELETED','DELETE','ARCHIVED') THEN 'removido'
           ELSE 'outro' END estado,
      public.artist_ads_campaign_key(m.nome) nkey
    FROM agg a LEFT JOIN cm m ON m.platform=a.platform AND m.connection_id=a.connection_id AND m.cid=a.cid
    JOIN conns c ON c.id=a.connection_id
  ),
  camp2 AS (
    SELECT cp.*,
      CASE
        WHEN cp.platform='tiktok' AND cp.nome ~* 'visualiza' THEN 'views_6s'
        WHEN cp.platform='tiktok' AND cp.nome ~* 'tr[aá]fego' THEN 'chegada_smart_link'
        WHEN cp.platform='meta' AND cp.nome ~* '^\s*\[mp\]' AND coalesce(cp.objetivo,'') ~* 'traffic|link_clicks' THEN 'chegada_smart_link'
        WHEN cp.platform='meta' AND coalesce(cp.otimizacao,'') ~* 'VISIT_INSTAGRAM_PROFILE|PROFILE_VISIT' THEN 'visitas_perfil'
        WHEN cp.platform='google' AND coalesce(cp.objetivo,'')='VIDEO' AND coalesce(cp.otimizacao,'')='TARGET_CPM' THEN 'impressoes'
      END rtipo,
      (SELECT count(*) FROM public.song_link_events e
        WHERE e.artist_id=p_artist_id AND e.event='arrival'
          AND e.created_at >= p_from::timestamptz AND e.created_at < (p_to+1)::timestamptz
          AND CASE cp.platform WHEN 'tiktok' THEN lower(coalesce(e.utm_source,''))='tiktok'
                               WHEN 'meta' THEN lower(coalesce(e.utm_source,'')) IN ('meta','facebook','instagram','fb','ig')
                               ELSE false END
          AND length(public.artist_ads_campaign_key(e.utm_campaign)) >= 10
          AND (public.artist_ads_campaign_key(e.utm_campaign) = cp.nkey
               OR cp.nkey LIKE public.artist_ads_campaign_key(e.utm_campaign)||'%'
               OR public.artist_ads_campaign_key(e.utm_campaign) LIKE cp.nkey||'%')) chegadas,
      (SELECT sum((a->>'value')::numeric) FROM crm.meta_campaign_insights_daily i, jsonb_array_elements(
          CASE WHEN jsonb_typeof(i.raw->'actions')='array' THEN i.raw->'actions' ELSE '[]'::jsonb END) a
        WHERE cp.platform='meta' AND i.connection_id=cp.connection_id AND i.external_campaign_id=cp.cid
          AND i.date_start BETWEEN p_from AND p_to
          AND a->>'action_type' IN ('profile_visit','instagram_profile_visit','onsite_conversion.profile_visit','ig_profile_visit')) visitas
    FROM camp cp
  ),
  camp3 AS (
    SELECT c2.*,
      CASE c2.rtipo
        WHEN 'views_6s' THEN jsonb_build_object('nome','views_6s','valor',c2.t6s,'custo',CASE WHEN c2.t6s>0 THEN round(c2.gasto/c2.t6s,6) END)
        WHEN 'chegada_smart_link' THEN
          CASE WHEN c2.chegadas>0 THEN jsonb_build_object('nome','chegada_smart_link','valor',c2.chegadas,'custo',round(c2.gasto/c2.chegadas,4))
               ELSE jsonb_build_object('nome','chegada_smart_link','valor',c2.clk,'custo',CASE WHEN c2.clk>0 THEN round(c2.gasto/c2.clk,4) END) END
        WHEN 'visitas_perfil' THEN
          CASE WHEN c2.visitas IS NOT NULL THEN jsonb_build_object('nome','visitas_perfil','valor',c2.visitas,'custo',CASE WHEN c2.visitas>0 THEN round(c2.gasto/c2.visitas,4) END)
               ELSE jsonb_build_object('nome','cliques_link','valor',c2.clk,'custo',CASE WHEN c2.clk>0 THEN round(c2.gasto/c2.clk,4) END) END
        WHEN 'impressoes' THEN jsonb_build_object('nome','impressoes','valor',c2.imp,'custo',CASE WHEN c2.imp>0 THEN round(c2.gasto/(c2.imp/1000.0),4) END)
      END resultado,
      CASE c2.rtipo
        WHEN 'views_6s' THEN 'visualizações de 6 s da plataforma'
        WHEN 'chegada_smart_link' THEN CASE WHEN c2.chegadas>0 THEN 'song_link_events arrival por utm_source+utm_campaign'
                                            ELSE 'fallback: cliques (sem UTM correspondente)' END
        WHEN 'visitas_perfil' THEN CASE WHEN c2.visitas IS NOT NULL THEN 'insights Meta: action profile_visit'
                                        ELSE 'fallback: cliques (os insights Meta gravados não trazem action de visita ao perfil)' END
        WHEN 'impressoes' THEN 'impressões; custo = CPM'
      END resultado_origem,
      (SELECT array_agg(gs::date ORDER BY gs)
         FROM generate_series(c2.primeira_linha,
                CASE WHEN c2.estado='ativo' THEN least(p_to, current_date-1) ELSE c2.ultima_linha END, '1 day') gs
         WHERE NOT EXISTS (SELECT 1 FROM cd x WHERE x.platform=c2.platform AND x.connection_id=c2.connection_id AND x.cid=c2.cid AND x.dia=gs::date)) sem_leitura,
      (SELECT jsonb_build_object('nome', coalesce(p.resumo->'meta'->>'nome', g.resultado_nome),
                                 'valor', coalesce((p.resumo->'meta'->>'valor')::numeric, g.meta_valor))
         FROM (SELECT 1) one
         LEFT JOIN LATERAL (SELECT pp.resumo FROM crm.meta_publish_plan pp
                 WHERE pp.company_id=v_company AND pp.artist_id=p_artist_id
                   AND coalesce(pp.external_campaign_id, pp.meta_campaign_id)=c2.cid
                   AND jsonb_typeof(pp.resumo->'meta')='object' AND (pp.resumo->'meta'->>'valor') IS NOT NULL
                 ORDER BY pp.created_at DESC LIMIT 1) p ON true
         LEFT JOIN LATERAL (SELECT gg.resultado_nome, gg.meta_valor FROM public.artist_ads_campaign_goals gg
                 WHERE gg.company_id=v_company AND gg.platform=c2.platform AND gg.external_campaign_id=c2.cid
                   AND gg.nivel='campaign' AND gg.valido_desde<=p_to
                 ORDER BY gg.valido_desde DESC LIMIT 1) g ON true
         WHERE p.resumo IS NOT NULL OR g.resultado_nome IS NOT NULL) meta_obj,
      (SELECT (gc.reach->k->>'unique_users')::numeric FROM crm.google_campaign gc, jsonb_object_keys(coalesce(gc.reach,'{}'::jsonb)) k
        WHERE c2.platform='google' AND gc.connection_id=c2.connection_id AND gc.external_campaign_id=c2.cid
          AND gc.reach->k->>'periodo' = p_from::text||'..'||p_to::text
          AND (gc.reach->k->>'unique_users') ~ '^[0-9]+$' LIMIT 1) alcance
    FROM camp2 c2
  ),
  camp_json AS (
    SELECT c.platform, c.connection_id, c.gasto, jsonb_build_object(
      'campaign_id', c.cid, 'nome', c.nome, 'account_id', c.account_id, 'currency', c.currency,
      'estado_normalizado', c.estado, 'objetivo', c.objetivo, 'otimizacao', c.otimizacao,
      'orcamento_diario', c.orc, 'primeiro_dia', c.d0, 'ultimo_dia', c.d1, 'dias_com_entrega', c.dias_entrega,
      'gasto', c.gasto, 'gasto_ref', c.gasto_ref, 'impressoes', c.imp, 'cliques', c.clk,
      'ctr', CASE WHEN c.imp>0 THEN round(c.clk/c.imp*100,4) END,
      'cpc', CASE WHEN c.clk>0 THEN round(c.gasto/c.clk,4) END,
      'cpm', CASE WHEN c.imp>0 THEN round(c.gasto/c.imp*1000,4) END,
      'video', CASE c.platform
        WHEN 'meta' THEN jsonb_build_object('meta_3s',c.m3s,'meta_thruplay',c.mthru,'meta_p25',c.p25,'meta_p50',c.p50,'meta_p75',c.p75,'meta_p100',c.p100)
        WHEN 'google' THEN jsonb_build_object('google_views',c.gviews)
        ELSE jsonb_build_object('tiktok_2s',c.t2s,'tiktok_6s',c.t6s) END,
      'tiktok', CASE WHEN c.platform='tiktok' THEN jsonb_build_object('gostos',c.likes,'seguidores',c.follows) END,
      'resultado', c.resultado,
      'alcance_periodo', c.alcance,
      'meta', c.meta_obj,
      'fonte', jsonb_build_object('data_source', c.src, 'ultimo_dia_com_dados', c.ultima_linha,
               'ultima_leitura', c.leitura, 'dias_sem_leitura', coalesce(to_jsonb(c.sem_leitura),'[]'::jsonb),
               'resultado_origem', c.resultado_origem),
      'linked_song_id', c.song) j,
      c.rtipo, c.resultado_origem, c.nome, c.sem_leitura, c.fx_missing, c.song
    FROM camp3 c
  ),
  plat AS (
    SELECT p.platform,
      jsonb_build_object('platform', p.platform,
        'contas', (SELECT coalesce(jsonb_agg(jsonb_build_object('account_id', c.selected_ad_account_id,
                     'account_name', c.selected_ad_account_name, 'currency', c.selected_ad_account_currency,
                     'gestor', CASE WHEN c.selected_ad_account_name ~* '^\s*mp\M'
                                      OR EXISTS (SELECT 1 FROM cm x WHERE x.connection_id=c.id AND (x.nome ~* '^\s*\[mp\]' OR x.cid LIKE 'manual:mp-%'))
                                    THEN 'mp' ELSE 'externo' END) ORDER BY c.selected_ad_account_name),'[]'::jsonb)
                   FROM conns c WHERE c.platform=p.platform),
        'campanhas', (SELECT coalesce(jsonb_agg(cj.j ORDER BY cj.gasto DESC NULLS LAST),'[]'::jsonb) FROM camp_json cj WHERE cj.platform=p.platform),
        'serie_diaria', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',s.dia,'currency',s.currency,'gasto',s.g,'gasto_ref',s.gr) ORDER BY s.dia, s.currency),'[]'::jsonb)
                   FROM (SELECT dia, currency, round(sum(spend),2) g, round(sum(spend_ref),2) gr FROM cdr WHERE cdr.platform=p.platform GROUP BY 1,2) s)
      ) j
    FROM (SELECT DISTINCT platform FROM conns) p
  )
  SELECT
    (SELECT coalesce(jsonb_agg(j ORDER BY array_position(ARRAY['meta','google','tiktok'], platform)),'[]'::jsonb) FROM plat),
    jsonb_build_object(
      'gasto_ref', (SELECT round(sum(spend_ref),2) FROM cdr),
      'fx_missing_days', (SELECT count(DISTINCT dia) FROM cdr WHERE fx_miss),
      'gasto_por_moeda', (SELECT coalesce(jsonb_agg(jsonb_build_object('currency',currency,'valor',v) ORDER BY currency),'[]'::jsonb)
                          FROM (SELECT currency, round(sum(spend),2) v FROM cdr GROUP BY 1 HAVING sum(spend)>0) z),
      'impressoes', (SELECT sum(imp) FROM cdr), 'cliques', (SELECT sum(clk) FROM cdr),
      'views', jsonb_build_object('meta_3s',(SELECT sum(m3s) FROM cdr),'meta_thruplay',(SELECT sum(mthru) FROM cdr),
        'google_views',(SELECT sum(gviews) FROM cdr),'tiktok_2s',(SELECT sum(t2s) FROM cdr),'tiktok_6s',(SELECT sum(t6s) FROM cdr))),
    (SELECT coalesce(jsonb_agg(l),'[]'::jsonb) FROM (
      SELECT 'Conta '||coalesce(c.selected_ad_account_name,c.selected_ad_account_id)||' ('||c.platform||', '||coalesce(c.selected_ad_account_currency,'?')||'): sem entrega no período' l
        FROM conns c WHERE NOT EXISTS (SELECT 1 FROM cdr WHERE cdr.connection_id=c.id AND cdr.spend>0)
      UNION ALL SELECT 'Campanha "'||coalesce(nome,'?')||'": resultado '||resultado_origem FROM camp_json WHERE resultado_origem LIKE 'fallback%'
      UNION ALL SELECT 'Campanha "'||coalesce(nome,'?')||'": sem regra de resultado para o objetivo — resultado null' FROM camp_json WHERE rtipo IS NULL
      UNION ALL SELECT 'Campanha "'||coalesce(nome,'?')||'": dias sem leitura '||array_to_string(sem_leitura, ', ') FROM camp_json WHERE cardinality(sem_leitura)>0
      UNION ALL SELECT 'Campanha "'||coalesce(nome,'?')||'": '||fx_missing||' dia(s) sem câmbio para '||v_ref FROM camp_json WHERE fx_missing>0
      UNION ALL SELECT 'Alcance do período: não há alcance único gravado para este período (alcance diário não se soma) — alcance_periodo null'
        WHERE EXISTS (SELECT 1 FROM camp3 WHERE alcance IS NULL)
    ) q)
  INTO v_plat, v_tot, v_lac;

  WITH songs AS (
    SELECT DISTINCT s.id, s.title FROM public.artist_songs s
    WHERE s.artist_id=p_artist_id AND s.id IN (
      SELECT (c->>'linked_song_id')::uuid FROM jsonb_array_elements(v_plat) p, jsonb_array_elements(p->'campanhas') c
      WHERE c->>'linked_song_id' IS NOT NULL)
  ),
  m AS (
    SELECT d.* FROM public.artist_song_metrics_daily d JOIN songs s ON s.id=d.song_id
    WHERE d.metric_date BETWEEN p_from AND p_to
  ),
  ouv AS (
    SELECT DISTINCT ON (song_id, metric_date) song_id, metric_date, value FROM m
    WHERE metric='s4a_listeners_28d' ORDER BY song_id, metric_date, (source='s4a_api') DESC, captured_at DESC
  ),
  ugc AS (
    SELECT DISTINCT ON (song_id, metric_date) song_id, metric_date, value, source FROM m
    WHERE metric='ugc_videos' AND platform='tiktok' AND source IN ('ios_shortcut','manual')
    ORDER BY song_id, metric_date, CASE source WHEN 'ios_shortcut' THEN 1 ELSE 2 END, captured_at DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'song_id', s.id, 'titulo', s.title,
      'streams_s4a_periodo', (SELECT sum(value) FROM m WHERE m.song_id=s.id AND metric='s4a_streams_day'),
      'ouvintes_inicio', (SELECT jsonb_build_object('valor',value,'data',metric_date) FROM ouv WHERE ouv.song_id=s.id ORDER BY metric_date LIMIT 1),
      'ouvintes_fim', (SELECT jsonb_build_object('valor',value,'data',metric_date) FROM ouv WHERE ouv.song_id=s.id ORDER BY metric_date DESC LIMIT 1),
      'ugc_inicio', (SELECT jsonb_build_object('valor',value,'data',metric_date,'source',source) FROM ugc WHERE ugc.song_id=s.id ORDER BY metric_date LIMIT 1),
      'ugc_fim', (SELECT jsonb_build_object('valor',value,'data',metric_date,'source',source) FROM ugc WHERE ugc.song_id=s.id ORDER BY metric_date DESC LIMIT 1)
    ) ORDER BY s.title),'[]'::jsonb)
  INTO v_mus FROM songs s;

  v_out := jsonb_build_object(
    'artista', jsonb_build_object('id', p_artist_id, 'nome', v_nome),
    'periodo', jsonb_build_object('de', p_from, 'ate', p_to, 'dias', (p_to - p_from) + 1),
    'gerado_em', now(),
    'ref_currency', v_ref,
    'totais', v_tot,
    'plataformas', v_plat,
    'musica', v_mus,
    'lacunas', v_lac);
  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.artist_ads_period_report(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_period_report(uuid,date,date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.artist_ads_campaign_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_campaign_key(text) TO authenticated, service_role;