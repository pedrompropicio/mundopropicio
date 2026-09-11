-- Carreira Artística — ligação oficial de canais (Instagram via Facebook Login)
-- Padrão da secção 18 do DATABASE.md. NADA do schema crm é tocado.

-- ============================================================ 1) oauth states
CREATE TABLE public.artist_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),           -- é o "state" do OAuth
  company_id uuid NOT NULL DEFAULT current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  artist_channel_id uuid NOT NULL REFERENCES public.artist_channels(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('meta','google','tiktok')),
  return_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

CREATE INDEX idx_artist_oauth_states_expires ON public.artist_oauth_states(expires_at);
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.artist_oauth_states
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

GRANT ALL ON public.artist_oauth_states TO service_role;
ALTER TABLE public.artist_oauth_states ENABLE ROW LEVEL SECURITY;
-- Sem policies: authenticated/anon não têm acesso nenhum. Só service_role.

-- Consumo de uso único: apaga a linha e devolve-a se ainda não expirou.
CREATE OR REPLACE FUNCTION public.artist_consume_oauth_state(p_state_id uuid)
RETURNS TABLE(company_id uuid, user_id uuid, artist_channel_id uuid, provider text, return_url text, valid boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.artist_oauth_states%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.artist_oauth_states
  WHERE id = p_state_id AND expires_at > now();

  IF NOT FOUND THEN
    -- limpeza oportunista dos expirados
    DELETE FROM public.artist_oauth_states WHERE expires_at <= now();
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text, false;
    RETURN;
  END IF;

  DELETE FROM public.artist_oauth_states WHERE id = p_state_id;
  RETURN QUERY SELECT v.company_id, v.user_id, v.artist_channel_id, v.provider, v.return_url, true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.artist_consume_oauth_state(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.artist_consume_oauth_state(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.artist_consume_oauth_state(uuid) TO service_role;

-- ====================================================== 2) ligações de canais
CREATE TABLE public.artist_channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  artist_channel_id uuid NOT NULL UNIQUE REFERENCES public.artist_channels(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('meta','google','tiktok')),
  external_account_id text,
  external_account_username text,
  external_page_id text,
  external_page_name text,
  access_token_encrypted text NOT NULL,
  token_type text,
  scopes text[],
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked','error')),
  last_validated_at timestamptz,
  last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  connected_by uuid,
  connected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_artist_channel_connections_artist ON public.artist_channel_connections(artist_id);
CREATE INDEX idx_artist_channel_connections_company ON public.artist_channel_connections(company_id);
CREATE INDEX idx_artist_channel_connections_provider_status ON public.artist_channel_connections(provider, status);

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.artist_channel_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();
CREATE TRIGGER trg_artist_channel_connections_updated_at BEFORE UPDATE ON public.artist_channel_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT ALL ON public.artist_channel_connections TO service_role;
ALTER TABLE public.artist_channel_connections ENABLE ROW LEVEL SECURITY;
-- Sem NENHUMA policy: os tokens nunca são legíveis pelo cliente.
-- O estado visível para a app é artist_channels.auth_status.

-- ====================================================== 3) demografia
CREATE TABLE public.artist_audience_demographics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  platform text NOT NULL,
  audience_type text NOT NULL CHECK (audience_type IN ('followers','engaged','reached')),
  dimension text NOT NULL CHECK (dimension IN ('city','country','age','gender','age_gender')),
  dim_key text NOT NULL,
  value numeric NOT NULL,
  timeframe text,
  snapshot_date date NOT NULL,
  source text NOT NULL DEFAULT 'platform_api',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_artist_audience_demographics
    UNIQUE (artist_id, platform, audience_type, dimension, dim_key, snapshot_date)
);

CREATE INDEX idx_artist_audience_demographics_artist_date ON public.artist_audience_demographics(artist_id, snapshot_date DESC);
CREATE INDEX idx_artist_audience_demographics_company ON public.artist_audience_demographics(company_id);

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.artist_audience_demographics
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_audience_demographics TO authenticated;
GRANT ALL ON public.artist_audience_demographics TO service_role;
ALTER TABLE public.artist_audience_demographics ENABLE ROW LEVEL SECURITY;

CREATE POLICY artist_audience_demographics_select ON public.artist_audience_demographics
  FOR SELECT TO authenticated USING (true);
CREATE POLICY artist_audience_demographics_insert ON public.artist_audience_demographics
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'editor'::app_role));
CREATE POLICY artist_audience_demographics_update ON public.artist_audience_demographics
  FOR UPDATE TO authenticated USING (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'editor'::app_role))
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'editor'::app_role));
CREATE POLICY artist_audience_demographics_delete ON public.artist_audience_demographics
  FOR DELETE TO authenticated USING (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'editor'::app_role));
CREATE POLICY company_isolation_artist_audience_demographics ON public.artist_audience_demographics
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (row_belongs_to_current_company(company_id))
  WITH CHECK (row_belongs_to_current_company(company_id));

-- ====================================================== 4) conteúdos
CREATE TABLE public.artist_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  platform text NOT NULL,
  external_id text NOT NULL,
  content_type text CHECK (content_type IN ('post','reel','carousel','video','story','short','outro')),
  permalink text,
  caption_excerpt text CHECK (caption_excerpt IS NULL OR char_length(caption_excerpt) <= 200),
  thumbnail_url text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_artist_content UNIQUE (artist_id, platform, external_id)
);

CREATE INDEX idx_artist_content_artist_published ON public.artist_content(artist_id, published_at DESC);
CREATE INDEX idx_artist_content_company ON public.artist_content(company_id);

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.artist_content
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();
CREATE TRIGGER trg_artist_content_updated_at BEFORE UPDATE ON public.artist_content
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_content TO authenticated;
GRANT ALL ON public.artist_content TO service_role;
ALTER TABLE public.artist_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY artist_content_select ON public.artist_content
  FOR SELECT TO authenticated USING (true);
CREATE POLICY artist_content_insert ON public.artist_content
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'editor'::app_role));
CREATE POLICY artist_content_update ON public.artist_content
  FOR UPDATE TO authenticated USING (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'editor'::app_role))
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'editor'::app_role));
CREATE POLICY artist_content_delete ON public.artist_content
  FOR DELETE TO authenticated USING (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'editor'::app_role));
CREATE POLICY company_isolation_artist_content ON public.artist_content
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (row_belongs_to_current_company(company_id))
  WITH CHECK (row_belongs_to_current_company(company_id));

CREATE TABLE public.artist_content_metrics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.artist_content(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  platform text NOT NULL,
  metric text NOT NULL,
  metric_date date NOT NULL,
  value numeric NOT NULL,
  source text NOT NULL DEFAULT 'platform_api',
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_artist_content_metrics_daily UNIQUE (content_id, metric, metric_date, source)
);

CREATE INDEX idx_artist_content_metrics_artist_date ON public.artist_content_metrics_daily(artist_id, metric_date DESC);
CREATE INDEX idx_artist_content_metrics_content_date ON public.artist_content_metrics_daily(content_id, metric_date DESC);
CREATE INDEX idx_artist_content_metrics_company ON public.artist_content_metrics_daily(company_id);

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.artist_content_metrics_daily
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_content_metrics_daily TO authenticated;
GRANT ALL ON public.artist_content_metrics_daily TO service_role;
ALTER TABLE public.artist_content_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY artist_content_metrics_daily_select ON public.artist_content_metrics_daily
  FOR SELECT TO authenticated USING (true);
CREATE POLICY artist_content_metrics_daily_insert ON public.artist_content_metrics_daily
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'editor'::app_role));
CREATE POLICY artist_content_metrics_daily_update ON public.artist_content_metrics_daily
  FOR UPDATE TO authenticated USING (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'editor'::app_role))
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'editor'::app_role));
CREATE POLICY artist_content_metrics_daily_delete ON public.artist_content_metrics_daily
  FOR DELETE TO authenticated USING (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'editor'::app_role));
CREATE POLICY company_isolation_artist_content_metrics_daily ON public.artist_content_metrics_daily
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (row_belongs_to_current_company(company_id))
  WITH CHECK (row_belongs_to_current_company(company_id));