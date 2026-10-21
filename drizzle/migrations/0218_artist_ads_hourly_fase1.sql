SET LOCAL lock_timeout = '5s';

-- Pré-condições: objetos novos ausentes; não reescrever objetos existentes.
DO $pre$
BEGIN
  IF to_regclass('crm.ads_insights_hourly') IS NOT NULL
     OR to_regclass('public.artist_ads_refresh_control') IS NOT NULL
     OR to_regprocedure('public.artist_ads_refresh_claim(uuid,boolean)') IS NOT NULL
     OR to_regprocedure('public.artist_ads_refresh_finish(uuid,uuid,jsonb)') IS NOT NULL
     OR to_regprocedure('crm.ads_hourly_validate_connection()') IS NOT NULL THEN
    RAISE EXCEPTION 'fase1: objetos já existem; rever definição/ACL antes de aplicar';
  END IF;
  IF to_regprocedure('public.artist_access_check(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'fase1: falta autorização canónica D-ERP259';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crm.ads_insights_breakdown_daily'::regclass
    AND conname='ads_insights_breakdown_daily_breakdown_check'
    AND pg_get_constraintdef(oid) LIKE '%''device''%')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crm.ads_insights_breakdown_daily'::regclass
    AND conname='ads_insights_breakdown_daily_level_check'
    AND pg_get_constraintdef(oid) LIKE '%''adset''%') THEN
    RAISE EXCEPTION 'fase1: drift no contrato diário';
  END IF;
END $pre$;

CREATE TABLE crm.ads_insights_hourly (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta','tiktok','google')),
  ad_account_id text NOT NULL CHECK (length(btrim(ad_account_id)) > 0),
  level text NOT NULL CHECK (level IN ('campaign','adset')),
  external_campaign_id text NOT NULL CHECK (length(btrim(external_campaign_id)) > 0),
  external_adset_id text NOT NULL DEFAULT '',
  account_timezone text NOT NULL CHECK (length(btrim(account_timezone)) > 0),
  metric_date date NOT NULL,
  metric_hour smallint NOT NULL CHECK (metric_hour BETWEEN 0 AND 23),
  spend_cents bigint CHECK (spend_cents >= 0),
  impressions bigint CHECK (impressions >= 0),
  clicks bigint CHECK (clicks >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(raw)='object' AND octet_length(raw::text)<=8192),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((level='campaign' AND external_adset_id='')
      OR (level='adset' AND length(btrim(external_adset_id))>0)),
  PRIMARY KEY (connection_id,platform,ad_account_id,account_timezone,level,
               external_campaign_id,external_adset_id,metric_date,metric_hour)
);
REVOKE ALL ON crm.ads_insights_hourly FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.ads_insights_hourly TO service_role;
ALTER TABLE crm.ads_insights_hourly ENABLE ROW LEVEL SECURITY;
-- Sem policies: sem acesso direto de utilizadores. Leituras futuras por RPC D-ERP259.
CREATE INDEX ads_insights_hourly_company_date_idx
  ON crm.ads_insights_hourly(company_id,metric_date,platform);

CREATE TABLE public.artist_ads_refresh_control (
  artist_id uuid PRIMARY KEY REFERENCES public.artists(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  last_requested_at timestamptz,
  last_started_at timestamptz NOT NULL,
  lease_until timestamptz,
  request_id uuid,
  last_synced_at timestamptz,
  platform_results jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(platform_results)='object' AND octet_length(platform_results::text)<=8192)
);
REVOKE ALL ON public.artist_ads_refresh_control FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_ads_refresh_control TO service_role;
ALTER TABLE public.artist_ads_refresh_control ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION crm.ads_hourly_validate_connection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, crm
AS $fn$
DECLARE c record;
BEGIN
  SELECT company_id,platform,connection_scope,artist_id,selected_ad_account_id
    INTO c FROM crm.ad_platform_connections WHERE id=NEW.connection_id FOR SHARE;
  IF NOT FOUND OR c.company_id IS DISTINCT FROM NEW.company_id
     OR c.platform IS DISTINCT FROM NEW.platform OR c.connection_scope<>'artist'
     OR c.artist_id IS NULL OR c.selected_ad_account_id IS DISTINCT FROM NEW.ad_account_id THEN
    RAISE EXCEPTION 'hourly: ligação/empresa/plataforma/conta incompatíveis' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=NEW.account_timezone) THEN
    RAISE EXCEPTION 'hourly: fuso da conta inválido' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION crm.ads_hourly_validate_connection() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER ads_hourly_validate_connection
  BEFORE INSERT OR UPDATE ON crm.ads_insights_hourly
  FOR EACH ROW EXECUTE FUNCTION crm.ads_hourly_validate_connection();

-- Manual: JWT do utilizador. Agendado: service_role sem auth.uid(), artista ativo.
CREATE FUNCTION public.artist_ads_refresh_claim(p_artist_id uuid,p_scheduled boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, crm
AS $fn$
DECLARE v_company uuid; v_now timestamptz:=clock_timestamp(); v_id uuid:=gen_random_uuid();
        v_row public.artist_ads_refresh_control%ROWTYPE;
BEGIN
  IF p_scheduled IS NULL THEN RAISE EXCEPTION 'p_scheduled obrigatório'; END IF;
  IF p_scheduled THEN
    IF coalesce(auth.role(),'')<>'service_role' THEN
      RAISE EXCEPTION 'sync agendado reservado ao serviço' USING ERRCODE='42501';
    END IF;
    SELECT a.company_id INTO v_company FROM public.artists a
      WHERE a.id=p_artist_id AND a.status='ativo' AND a.company_id IS NOT NULL FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'artista ativo inexistente ou sem empresa' USING ERRCODE='42501';
    END IF;
  ELSE
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sessão obrigatória' USING ERRCODE='42501'; END IF;
    v_company:=public.artist_access_check(p_artist_id,'read','traffic');
    -- Lock por artista: permissão manual validada antes de consumir o limite.
    PERFORM 1 FROM public.artists WHERE id=p_artist_id AND company_id=v_company FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'artista alterado' USING ERRCODE='42501'; END IF;
  END IF;
  INSERT INTO public.artist_ads_refresh_control(artist_id,company_id,last_started_at)
    VALUES(p_artist_id,v_company,v_now) ON CONFLICT(artist_id) DO NOTHING;
  SELECT * INTO v_row FROM public.artist_ads_refresh_control WHERE artist_id=p_artist_id FOR UPDATE;
  IF v_row.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'empresa do artista alterada; rever controlo' USING ERRCODE='42501';
  END IF;
  IF v_row.lease_until>v_now THEN
    RETURN jsonb_build_object('accepted',false,'reason','in_progress',
      'retry_after_seconds',ceil(extract(epoch FROM v_row.lease_until-v_now)),
      'last_synced_at',v_row.last_synced_at,'platforms',v_row.platform_results);
  END IF;
  IF NOT p_scheduled AND v_row.last_requested_at>v_now-interval '2 minutes' THEN
    RETURN jsonb_build_object('accepted',false,'reason','rate_limited',
      'retry_after_seconds',ceil(extract(epoch FROM v_row.last_requested_at+interval '2 minutes'-v_now)),
      'last_synced_at',v_row.last_synced_at,'platforms',v_row.platform_results);
  END IF;
  UPDATE public.artist_ads_refresh_control SET request_id=v_id,last_started_at=v_now,
    lease_until=v_now+interval '5 minutes',
    last_requested_at=CASE WHEN p_scheduled THEN last_requested_at ELSE v_now END
    WHERE artist_id=p_artist_id;
  RETURN jsonb_build_object('accepted',true,'request_id',v_id,'company_id',v_company,
    'lease_until',v_now+interval '5 minutes','last_synced_at',v_row.last_synced_at,
    'platforms',v_row.platform_results);
END $fn$;
REVOKE ALL ON FUNCTION public.artist_ads_refresh_claim(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.artist_ads_refresh_claim(uuid,boolean) TO authenticated,service_role;

-- Só o serviço fecha o pedido; resultados não contêm tokens/raw/identificadores pessoais.
CREATE FUNCTION public.artist_ads_refresh_finish(p_artist_id uuid,p_request_id uuid,p_results jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, crm
AS $fn$
DECLARE v_row public.artist_ads_refresh_control%ROWTYPE; v_now timestamptz:=clock_timestamp();
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN
    RAISE EXCEPTION 'fecho reservado ao serviço' USING ERRCODE='42501';
  END IF;
  IF p_results IS NULL OR jsonb_typeof(p_results)<>'object' OR octet_length(p_results::text)>8192
     OR EXISTS(SELECT 1 FROM jsonb_each(p_results) e WHERE e.key NOT IN ('meta','tiktok','google')
       OR jsonb_typeof(e.value)<>'object' OR coalesce(e.value->>'status','') NOT IN ('success','partial','error','not_connected'))
     OR EXISTS(SELECT 1 FROM jsonb_each(p_results) e,
       LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(e.value)='object' THEN e.value ELSE '{}'::jsonb END) k
       WHERE k NOT IN ('status','last_synced_at','rows_written','api_calls','reason')) THEN
    RAISE EXCEPTION 'resultados inválidos';
  END IF;
  SELECT * INTO v_row FROM public.artist_ads_refresh_control WHERE artist_id=p_artist_id FOR UPDATE;
  IF NOT FOUND OR p_request_id IS NULL OR v_row.request_id IS DISTINCT FROM p_request_id
     OR v_row.lease_until IS NULL OR v_row.lease_until<=v_now THEN
    RETURN jsonb_build_object('accepted',false,'reason','stale_request');
  END IF;
  UPDATE public.artist_ads_refresh_control SET lease_until=NULL,request_id=NULL,
    platform_results=p_results,
    last_synced_at=CASE WHEN EXISTS(SELECT 1 FROM jsonb_each(p_results) e WHERE e.value->>'status'='success')
      AND NOT EXISTS(SELECT 1 FROM jsonb_each(p_results) e WHERE e.value->>'status' IN ('partial','error'))
      THEN v_now ELSE last_synced_at END WHERE artist_id=p_artist_id RETURNING * INTO v_row;
  RETURN jsonb_build_object('accepted',true,'last_synced_at',v_row.last_synced_at,'platforms',v_row.platform_results);
END $fn$;
REVOKE ALL ON FUNCTION public.artist_ads_refresh_finish(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.artist_ads_refresh_finish(uuid,uuid,jsonb) TO service_role;

-- Revogações explícitas dos dois nomes sandbox existentes e de variantes futuras.
DO $acl$
DECLARE r record; t text; f text;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname='sandbox_exec' OR rolname LIKE 'sandbox_exec_%' LOOP
    FOREACH t IN ARRAY ARRAY['crm.ads_insights_hourly','public.artist_ads_refresh_control'] LOOP
      EXECUTE format('REVOKE ALL ON TABLE %s FROM %I',t,r.rolname);
    END LOOP;
    FOREACH f IN ARRAY ARRAY['crm.ads_hourly_validate_connection()',
      'public.artist_ads_refresh_claim(uuid,boolean)','public.artist_ads_refresh_finish(uuid,uuid,jsonb)'] LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f,r.rolname);
    END LOOP;
  END LOOP;
  -- Não alterar default privileges, esquemas ou grants dos objetos anteriores.
  IF EXISTS(SELECT 1 FROM pg_class c,LATERAL aclexplode(c.relacl) a
    WHERE c.oid IN ('crm.ads_insights_hourly'::regclass,'public.artist_ads_refresh_control'::regclass)
      AND a.grantee NOT IN (c.relowner,(SELECT oid FROM pg_roles WHERE rolname='service_role')))
    OR EXISTS(SELECT 1 FROM pg_attribute a,LATERAL aclexplode(a.attacl) x
    WHERE a.attrelid IN ('crm.ads_insights_hourly'::regclass,'public.artist_ads_refresh_control'::regclass)
      AND x.grantee<>(SELECT oid FROM pg_roles WHERE rolname='service_role')) THEN
    RAISE EXCEPTION 'fase1: ACL inesperada em tabela/coluna';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles role_check WHERE (role_check.rolname IN ('anon','authenticated') OR role_check.rolname='sandbox_exec'
      OR role_check.rolname LIKE 'sandbox_exec_%') AND (has_table_privilege(role_check.oid,'crm.ads_insights_hourly','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_table_privilege(role_check.oid,'public.artist_ads_refresh_control','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) THEN
    RAISE EXCEPTION 'fase1: acesso efetivo inesperado, incluindo herança';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(p.proacl) a WHERE p.oid IN
    ('crm.ads_hourly_validate_connection()'::regprocedure,'public.artist_ads_refresh_claim(uuid,boolean)'::regprocedure,
     'public.artist_ads_refresh_finish(uuid,uuid,jsonb)'::regprocedure)
    AND a.grantee NOT IN (p.proowner,(SELECT oid FROM pg_roles WHERE rolname='service_role'),
      CASE WHEN p.proname='artist_ads_refresh_claim' THEN (SELECT oid FROM pg_roles WHERE rolname='authenticated') ELSE p.proowner END)) THEN
    RAISE EXCEPTION 'fase1: ACL inesperada em função';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles role_check WHERE (role_check.rolname='anon' OR role_check.rolname='sandbox_exec'
      OR role_check.rolname LIKE 'sandbox_exec_%') AND
    (has_function_privilege(role_check.oid,'public.artist_ads_refresh_claim(uuid,boolean)','EXECUTE')
     OR has_function_privilege(role_check.oid,'public.artist_ads_refresh_finish(uuid,uuid,jsonb)','EXECUTE')
     OR has_function_privilege(role_check.oid,'crm.ads_hourly_validate_connection()','EXECUTE')))
    OR has_function_privilege('authenticated','public.artist_ads_refresh_finish(uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','crm.ads_hourly_validate_connection()','EXECUTE') THEN
    RAISE EXCEPTION 'fase1: EXECUTE efetivo inesperado, incluindo herança';
  END IF;
END $acl$;
