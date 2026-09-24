-- D-ERP143 — Várias contas Meta por artista: uma ligação por conta de anúncios.

DROP INDEX IF EXISTS crm.uq_conn_company_artist_platform;

CREATE UNIQUE INDEX IF NOT EXISTS uq_conn_company_artist_platform_account
  ON crm.ad_platform_connections (company_id, artist_id, platform, selected_ad_account_id)
  WHERE artist_id IS NOT NULL AND selected_ad_account_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_conn_company_artist_platform_pending
  ON crm.ad_platform_connections (company_id, artist_id, platform)
  WHERE artist_id IS NOT NULL AND selected_ad_account_id IS NULL;

CREATE OR REPLACE FUNCTION crm.upsert_artist_meta_connection(p_company_id uuid, p_artist_id uuid, p_user_id uuid, p_external_business_id text, p_external_business_name text, p_access_token text, p_token_type text, p_expires_at timestamp with time zone, p_master_key text, p_available_ad_accounts jsonb DEFAULT NULL::jsonb, p_status text DEFAULT 'pending_selection'::text, p_selected_ad_account_id text DEFAULT NULL::text, p_selected_ad_account_name text DEFAULT NULL::text, p_selected_ad_account_currency text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public', 'extensions'
AS $function$
DECLARE
  v_id        uuid;
  v_encrypted text;
BEGIN
  v_encrypted := encode(pgp_sym_encrypt(p_access_token, p_master_key), 'base64');

  UPDATE crm.ad_platform_connections c SET
    access_token_encrypted = v_encrypted,
    token_type             = p_token_type,
    expires_at             = p_expires_at,
    available_ad_accounts  = coalesce(p_available_ad_accounts, c.available_ad_accounts),
    status                 = CASE WHEN c.selected_ad_account_id IS NOT NULL THEN 'active' ELSE c.status END,
    connected_by           = coalesce(p_user_id, c.connected_by),
    last_validated_at      = now(),
    last_error             = NULL,
    consecutive_failures   = 0,
    disconnected_at        = NULL
  WHERE c.company_id = p_company_id AND c.artist_id = p_artist_id
    AND c.platform = 'meta' AND c.connection_scope = 'artist';

  SELECT c.id INTO v_id FROM crm.ad_platform_connections c
  WHERE c.company_id = p_company_id AND c.artist_id = p_artist_id
    AND c.platform = 'meta' AND c.connection_scope = 'artist'
    AND c.selected_ad_account_id IS NOT NULL
  ORDER BY (c.selected_ad_account_id = p_selected_ad_account_id) DESC NULLS LAST,
           c.connected_at ASC NULLS LAST
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  UPDATE crm.ad_platform_connections c SET
    external_business_id         = p_external_business_id,
    external_business_name       = p_external_business_name,
    selected_ad_account_id       = p_selected_ad_account_id,
    selected_ad_account_name     = p_selected_ad_account_name,
    selected_ad_account_currency = p_selected_ad_account_currency,
    status                       = p_status,
    connected_at                 = now()
  WHERE c.company_id = p_company_id AND c.artist_id = p_artist_id
    AND c.platform = 'meta' AND c.connection_scope = 'artist'
    AND c.selected_ad_account_id IS NULL
  RETURNING c.id INTO v_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO crm.ad_platform_connections (
    company_id, artist_id, connection_scope, platform,
    external_business_id, external_business_name,
    access_token_encrypted, token_type, expires_at,
    available_ad_accounts, selected_ad_account_id, selected_ad_account_name,
    selected_ad_account_currency, status, connected_by, connected_at,
    last_validated_at, last_error, consecutive_failures, disconnected_at
  ) VALUES (
    p_company_id, p_artist_id, 'artist', 'meta',
    p_external_business_id, p_external_business_name,
    v_encrypted, p_token_type, p_expires_at,
    p_available_ad_accounts, p_selected_ad_account_id, p_selected_ad_account_name,
    p_selected_ad_account_currency, p_status, p_user_id, now(),
    now(), NULL, 0, NULL
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.artist_ads_register_external(p_artist_id uuid, p_platform text, p_external_id text, p_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_ok      boolean;
  v_id      uuid;
  v_ext     text;
BEGIN
  IF p_platform NOT IN ('google', 'tiktok') THEN
    RAISE EXCEPTION 'plataforma invalida: %', p_platform;
  END IF;

  v_ext := regexp_replace(coalesce(p_external_id, ''), '\D', '', 'g');
  IF v_ext = '' THEN
    RAISE EXCEPTION 'external_id invalido';
  END IF;

  SELECT company_id INTO v_company FROM public.artists WHERE id = p_artist_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'artista nao encontrado';
  END IF;

  IF v_uid IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_uid
        AND ur.role IN ('admin','platform_admin','manager','marketing_manager')
        AND (ur.role = 'platform_admin' OR ur.company_id IS NULL OR ur.company_id = v_company)
    ) INTO v_ok;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'sem permissao para registar contas de anuncios deste artista';
    END IF;
  END IF;

  SELECT c.id INTO v_id FROM crm.ad_platform_connections c
  WHERE c.company_id = v_company AND c.artist_id = p_artist_id AND c.platform = p_platform
  ORDER BY c.connected_at DESC NULLS LAST
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE crm.ad_platform_connections c SET
      external_business_id   = v_ext,
      external_business_name = coalesce(p_name, c.external_business_name),
      disconnected_at        = NULL
    WHERE c.id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO crm.ad_platform_connections (
    company_id, artist_id, connection_scope, platform,
    external_business_id, external_business_name,
    status, connected_by, connected_at
  ) VALUES (
    v_company, p_artist_id, 'artist', p_platform,
    v_ext, p_name,
    'pending_link', v_uid, now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

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
  ORDER BY (CASE WHEN v_plat = 'google'
                 THEN EXISTS (SELECT 1 FROM crm.google_campaign g
                              WHERE g.connection_id = c.id AND g.external_campaign_id = p_campaign_id)
                 ELSE EXISTS (SELECT 1 FROM crm.meta_campaign_snapshot m
                              WHERE m.connection_id = c.id AND m.external_campaign_id = p_campaign_id)
            END) DESC,
           (lower(coalesce(c.status,'')) = 'active') DESC, c.connected_at DESC NULLS LAST
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