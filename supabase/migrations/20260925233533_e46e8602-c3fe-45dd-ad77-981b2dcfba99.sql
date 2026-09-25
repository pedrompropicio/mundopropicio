-- D-ERP144 adenda: camada core sem sessão para a porta de ingestão (Cowork).
CREATE TEMP TABLE _tt_eq(k text primary key, v jsonb) ON COMMIT DROP;

-- Prova ANTES (RPC antiga), anulada
DO $$
DECLARE v_uid uuid; r jsonb;
BEGIN
  SELECT user_id INTO v_uid FROM public.user_roles WHERE role='platform_admin' ORDER BY user_id LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_uid,'role','authenticated')::text, true);
  BEGIN
    r := public.artist_ads_tiktok_manual_upsert('947ee0c7-60a4-49f6-9882-561237c3483a'::uuid, jsonb_build_object(
      'campanha', jsonb_build_object('name','[MP] [ROUPA DE SOLTEIRA] [Visualizações UGC] 2026-09-25','status','ENABLE','objective','VIDEO_VIEWS','budget_cents',25000),
      'grupos', jsonb_build_array(jsonb_build_object('external_adgroup_id','1877256463382802','name','A1 #forro','status','ENABLE','budget_cents',12500)),
      'dias', jsonb_build_array(jsonb_build_object('date',(current_date-1)::text,'level','adgroup','external_id','1877256463382802','spend',123.45,'impressions',1000,'clicks',10,'video_views_6s',300,'video_views_2s',500,'likes',5,'follows',1,'reach',900))));
    RAISE EXCEPTION 'rollback_probe';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'rollback_probe' THEN RAISE; END IF;
  END;
  INSERT INTO _tt_eq VALUES ('antes', r);
END $$;

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
    FOREACH k IN ARRAY ARRAY['spend','impressions','clicks','video_views_6s','video_views_2s','likes','follows','reach'] LOOP
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
        currency, source, recorded_at, raw)
      VALUES (v_conn.company_id, p_connection_id, v_level, v_ext, v_cid, v_date,
        CASE WHEN v_spend IS NULL THEN NULL ELSE round(v_spend * 100)::bigint END,
        (d->>'impressions')::bigint, (d->>'clicks')::bigint, (d->>'video_views_6s')::bigint,
        (d->>'video_views_2s')::bigint, (d->>'likes')::bigint, (d->>'follows')::bigint, (d->>'reach')::bigint,
        v_currency, 'manual', now(), d || jsonb_build_object('gravado_por', p_actor))
      ON CONFLICT (connection_id, level, external_id, date_start) DO UPDATE SET
        external_campaign_id = EXCLUDED.external_campaign_id, spend_cents = EXCLUDED.spend_cents,
        impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, video_views_6s = EXCLUDED.video_views_6s,
        video_views_2s = EXCLUDED.video_views_2s, likes = EXCLUDED.likes, follows = EXCLUDED.follows,
        reach = EXCLUDED.reach, currency = EXCLUDED.currency, recorded_at = now(), raw = EXCLUDED.raw
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

REVOKE ALL ON FUNCTION crm.tiktok_manual_upsert_core(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm.tiktok_manual_upsert_core(uuid, jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.artist_ads_tiktok_manual_upsert(p_connection_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_conn record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessão obrigatória' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_conn FROM crm.ad_platform_connections WHERE id = p_connection_id;
  IF NOT FOUND OR v_conn.platform <> 'tiktok' OR v_conn.connection_scope <> 'artist' THEN
    RAISE EXCEPTION 'ligação TikTok de artista não encontrada' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = v_uid
      AND (r.role = 'platform_admin'
           OR (r.role IN ('admin','manager','marketing_manager') AND r.company_id = v_conn.company_id))
  ) THEN
    RAISE EXCEPTION 'sem permissão na empresa da ligação' USING ERRCODE = '42501';
  END IF;
  RETURN crm.tiktok_manual_upsert_core(p_connection_id, p_payload, v_uid::text);
END;
$function$;

-- Prova DEPOIS (RPC nova), anulada; tem de ser igual
DO $$
DECLARE v_uid uuid; r jsonb; a jsonb;
BEGIN
  SELECT user_id INTO v_uid FROM public.user_roles WHERE role='platform_admin' ORDER BY user_id LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_uid,'role','authenticated')::text, true);
  BEGIN
    r := public.artist_ads_tiktok_manual_upsert('947ee0c7-60a4-49f6-9882-561237c3483a'::uuid, jsonb_build_object(
      'campanha', jsonb_build_object('name','[MP] [ROUPA DE SOLTEIRA] [Visualizações UGC] 2026-09-25','status','ENABLE','objective','VIDEO_VIEWS','budget_cents',25000),
      'grupos', jsonb_build_array(jsonb_build_object('external_adgroup_id','1877256463382802','name','A1 #forro','status','ENABLE','budget_cents',12500)),
      'dias', jsonb_build_array(jsonb_build_object('date',(current_date-1)::text,'level','adgroup','external_id','1877256463382802','spend',123.45,'impressions',1000,'clicks',10,'video_views_6s',300,'video_views_2s',500,'likes',5,'follows',1,'reach',900))));
    RAISE EXCEPTION 'rollback_probe';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'rollback_probe' THEN RAISE; END IF;
  END;
  SELECT v INTO a FROM _tt_eq WHERE k='antes';
  IF a IS DISTINCT FROM r THEN
    RAISE EXCEPTION 'equivalência falhou: antes % depois %', a, r;
  END IF;
  RAISE NOTICE 'equivalência ok: %', r;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;