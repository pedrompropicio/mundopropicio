SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.artist_ads_campaign_settings(p_artist_id uuid, p_campaign_id text, p_platform text DEFAULT 'meta'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE
  v_company uuid := public.artist_ads_assert_access(p_artist_id);
  v_plat text := lower(coalesce(p_platform,'meta'));
  v_conn crm.ad_platform_connections%rowtype;
  v_out jsonb;
BEGIN
  SELECT c.* INTO v_conn FROM crm.ad_platform_connections c
  WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id
    AND c.company_id = v_company AND c.platform = v_plat
  ORDER BY (lower(coalesce(c.status,'')) = 'active') DESC, c.connected_at DESC NULLS LAST
  LIMIT 1;

  IF v_conn.id IS NULL THEN
    RAISE EXCEPTION 'sem ligação % para este artista', v_plat USING ERRCODE = 'P0002';
  END IF;

  IF v_plat = 'google' THEN
    SELECT jsonb_build_object(
      'plataforma', 'google',
      'campanha', jsonb_build_object(
        'id', gc.external_campaign_id,
        'nome', gc.name,
        'estado', gc.status,
        'objetivo', gc.advertising_channel_type,
        'sub_tipo', gc.settings->'campanha'->'videoCampaignSettings',
        'orcamento', jsonb_build_object(
          'tipo', 'diario',
          'valor', round(gc.budget_amount_micros/1000000.0, 2),
          'moeda', coalesce(v_conn.selected_ad_account_currency, 'BRL')),
        'lance', gc.bidding_strategy_type,
        'inicio', gc.start_date, 'fim', gc.end_date),
      'geografia', jsonb_build_object(
        'incluidos', coalesce((SELECT jsonb_agg(c->'localizacao'->>'nome_canonico')
                               FROM jsonb_array_elements(gc.settings->'criterios') c
                               WHERE c->>'tipo' = 'LOCATION' AND (c->>'negativo')::boolean IS NOT TRUE), '[]'::jsonb),
        'excluidos', coalesce((SELECT jsonb_agg(c->'localizacao'->>'nome_canonico')
                               FROM jsonb_array_elements(gc.settings->'criterios') c
                               WHERE c->>'tipo' = 'LOCATION' AND (c->>'negativo')::boolean IS TRUE), '[]'::jsonb)),
      'idiomas', coalesce((SELECT jsonb_agg(c->>'lingua') FROM jsonb_array_elements(gc.settings->'criterios') c
                           WHERE c->>'tipo' = 'LANGUAGE'), '[]'::jsonb),
      'idades', coalesce((SELECT jsonb_agg(c->>'faixa_etaria') FROM jsonb_array_elements(gc.settings->'criterios') c
                          WHERE c->>'tipo' = 'AGE_RANGE'), '[]'::jsonb),
      'generos', coalesce((SELECT jsonb_agg(c->>'genero') FROM jsonb_array_elements(gc.settings->'criterios') c
                           WHERE c->>'tipo' = 'GENDER'), '[]'::jsonb),
      'dispositivos', coalesce((SELECT jsonb_agg(c->>'dispositivo') FROM jsonb_array_elements(gc.settings->'criterios') c
                                WHERE c->>'tipo' = 'DEVICE'), '[]'::jsonb),
      'limite_frequencia', gc.settings->'campanha'->'frequencyCaps',
      'formatos', gc.settings->'campanha'->'videoCampaignSettings'->'videoAdInventoryControl',
      'alcance', gc.reach,
      'fonte', jsonb_build_object('tabela', 'crm.google_campaign',
                                  'data', gc.settings->>'recolhido_em',
                                  'api', gc.settings->>'api_version')
    ) INTO v_out
    FROM crm.google_campaign gc
    WHERE gc.connection_id = v_conn.id AND gc.external_campaign_id = p_campaign_id;
  ELSE
    SELECT jsonb_build_object(
      'plataforma', 'meta',
      'campanha', jsonb_build_object(
        'id', mc.external_campaign_id,
        'nome', mc.name,
        'estado', coalesce(mc.effective_status, mc.status),
        'objetivo', mc.objective,
        'sub_tipo', NULL,
        'orcamento', jsonb_build_object(
          'tipo', CASE WHEN coalesce(s.lifetime_budget_cents,0) > 0 THEN 'vitalicio' ELSE 'diario' END,
          'valor', round(coalesce(nullif(s.lifetime_budget_cents,0), s.daily_budget_cents, 0)/100.0, 2),
          'moeda', coalesce(s.currency, v_conn.selected_ad_account_currency)),
        'lance', s.bid_strategy,
        'inicio', s.start_time, 'fim', s.end_time),
      'geografia', jsonb_build_object(
        'incluidos', coalesce(s.targeting->'geo_locations', '{}'::jsonb),
        'excluidos', coalesce(s.targeting->'excluded_geo_locations', '{}'::jsonb)),
      'idiomas', coalesce(s.targeting->'locales', '[]'::jsonb),
      'idades', jsonb_build_object('min', s.targeting->'age_min', 'max', s.targeting->'age_max'),
      'generos', coalesce(s.targeting->'genders', '[]'::jsonb),
      'dispositivos', coalesce(s.targeting->'device_platforms', '[]'::jsonb),
      'limite_frequencia', s.raw->'frequency_control_specs',
      'formatos', coalesce(s.targeting->'publisher_platforms', '[]'::jsonb),
      'alcance', NULL,
      'fonte', jsonb_build_object('tabela', 'crm.meta_adset_snapshot', 'data', s.last_synced_at)
    ) INTO v_out
    FROM crm.meta_campaign_snapshot mc
    LEFT JOIN LATERAL (
      SELECT * FROM crm.meta_adset_snapshot a
      WHERE a.connection_id = mc.connection_id AND a.external_campaign_id = mc.external_campaign_id
      ORDER BY a.last_synced_at DESC NULLS LAST LIMIT 1
    ) s ON true
    WHERE mc.connection_id = v_conn.id AND mc.external_campaign_id = p_campaign_id;
  END IF;

  IF v_out IS NULL THEN
    RAISE EXCEPTION 'campanha % não encontrada em %', p_campaign_id, v_plat USING ERRCODE = 'P0002';
  END IF;
  RETURN v_out;
END $function$;

REVOKE EXECUTE ON FUNCTION public.artist_ads_campaign_settings(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.artist_ads_campaign_settings(uuid, text, text) TO authenticated, service_role;