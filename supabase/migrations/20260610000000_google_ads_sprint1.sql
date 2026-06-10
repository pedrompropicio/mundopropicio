-- ============================================================================
-- Google Ads — Sprint 1 (schema crm.google_*).
--
-- Integração Google Ads do MP Audience, em paralelo ao domínio Meta (crm.meta_*).
-- Esta migration cria APENAS o schema; NÃO depende de credenciais da Google API.
-- Espelha o padrão das crm.meta_* (RLS tenant_isolation_* + service_role_bypass,
-- GRANT USAGE no schema crm + SELECT/INSERT/UPDATE a authenticated E service_role,
-- last_synced_at explícito nas tabelas-espelho, raw jsonb).
--
-- Conteúdo:
--   • crm.google_click       — atribuição de clique (gclid/gbraid/wbraid), capturada na landing.
--   • crm.google_conversion  — fila de conversões a enviar via Data Manager API (populada no Sprint 2).
--   • crm.google_campaign / google_ad_group / google_keyword / google_asset_group
--     — esqueleto das tabelas-espelho de performance (populadas no Sprint 2). Tal como
--       crm.meta_campaign_snapshot, NÃO são source of truth para status/budget.
--
-- crm.ad_platform_connections já aceita platform IN ('meta','google','tiktok'),
-- por isso as tabelas-espelho referenciam-na por connection_id (platform='google').
-- ============================================================================

GRANT USAGE ON SCHEMA crm TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) crm.google_click — atribuição de clique (capturada na landing do Portal)
-- ────────────────────────────────────────────────────────────────────────────
-- gclid: case-sensitive (VARCHAR é case-sensitive por defeito no Postgres — NÃO usar
-- CITEXT nem lower()). gbraid/wbraid são as alternativas iOS/privacy-safe; EXATAMENTE
-- um dos três preenchido por registo. expires_at = captured_at + 90 dias (janela de
-- atribuição do Google), garantido por coluna GERADA.
CREATE TABLE IF NOT EXISTS crm.google_click (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  gclid varchar(255),
  gbraid varchar(255),
  wbraid varchar(255),
  landing_url text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  -- Evento associado quando a landing é de um evento (público.events). Nullable.
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  -- Correlação com o pixel/CAPI à maneira do Portal (UUID gerado client-side) e o
  -- lead capturado, se existir. Loose-coupling (SET NULL).
  client_event_id uuid,
  lead_capture_id uuid REFERENCES public.lead_capture(id) ON DELETE SET NULL,
  -- Estado de consentimento no momento da captura (gating igual ao pixel/CAPI).
  consent_granted boolean,
  user_agent text,
  raw jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_click_exactly_one_id CHECK (
    (gclid IS NOT NULL)::int + (gbraid IS NOT NULL)::int + (wbraid IS NOT NULL)::int = 1
  )
);
COMMENT ON TABLE crm.google_click IS
  'Atribuição de clique Google (gclid/gbraid/wbraid) capturada na landing. expires_at = captured_at + 90 dias.';
COMMENT ON COLUMN crm.google_click.gclid IS 'Google Click ID — case-sensitive (não normalizar).';

ALTER TABLE crm.google_click ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_select ON crm.google_click;
DROP POLICY IF EXISTS tenant_isolation_insert ON crm.google_click;
DROP POLICY IF EXISTS tenant_isolation_update ON crm.google_click;
DROP POLICY IF EXISTS service_role_bypass ON crm.google_click;
CREATE POLICY tenant_isolation_select ON crm.google_click FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
CREATE POLICY tenant_isolation_insert ON crm.google_click FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());
CREATE POLICY tenant_isolation_update ON crm.google_click FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
CREATE POLICY service_role_bypass ON crm.google_click FOR ALL TO service_role
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON crm.google_click TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_google_click_company ON crm.google_click(company_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_click_gclid ON crm.google_click(gclid) WHERE gclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_google_click_event ON crm.google_click(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_google_click_client_event ON crm.google_click(client_event_id) WHERE client_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_google_click_expires ON crm.google_click(expires_at);

-- expires_at = captured_at + 90 dias, preenchido por TRIGGER (não coluna gerada):
-- timestamptz + interval usa timestamptz_pl_interval, que é STABLE (não IMMUTABLE),
-- por isso não pode ser usado numa coluna GENERATED (erro 42P17). Acontece com
-- qualquer intervalo (dias ou segundos) — a solução é o trigger BEFORE INSERT/UPDATE.
CREATE OR REPLACE FUNCTION crm.google_click_set_expires()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  NEW.expires_at := NEW.captured_at + interval '90 days';
  RETURN NEW;
END
$func$;

DROP TRIGGER IF EXISTS trg_google_click_set_expires ON crm.google_click;
CREATE TRIGGER trg_google_click_set_expires
  BEFORE INSERT OR UPDATE OF captured_at ON crm.google_click
  FOR EACH ROW EXECUTE FUNCTION crm.google_click_set_expires();

-- ────────────────────────────────────────────────────────────────────────────
-- 2) crm.google_conversion — fila de conversões (envio via Data Manager API no Sprint 2)
-- ────────────────────────────────────────────────────────────────────────────
-- Espelha a lógica de envio de purchase do CAPI: order_id (transaction_id da venda
-- Ticketline/Fever) para deduplicação; status pending→sent/failed; data_manager_job_id
-- e error_detail guardam o resultado do envio.
CREATE TABLE IF NOT EXISTS crm.google_conversion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  conversion_action_ref text NOT NULL,
  -- Identificador de clique (exatamente um), + ligação opcional ao clique capturado.
  gclid varchar(255),
  gbraid varchar(255),
  wbraid varchar(255),
  google_click_id uuid REFERENCES crm.google_click(id) ON DELETE SET NULL,
  conversion_value numeric(14,2),
  currency_code text,
  -- transaction_id da venda (Ticketline/Fever) — chave de deduplicação.
  order_id text,
  conversion_datetime timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  data_manager_job_id text,
  error_detail text,
  sent_at timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_conversion_exactly_one_id CHECK (
    (gclid IS NOT NULL)::int + (gbraid IS NOT NULL)::int + (wbraid IS NOT NULL)::int = 1
  )
);
COMMENT ON TABLE crm.google_conversion IS
  'Fila/registo de conversões a enviar à Google via Data Manager API (Sprint 2). order_id = transaction_id para dedupe.';

-- Dedupe: a mesma venda (order_id) não é enviada 2x para a mesma conversion action.
CREATE UNIQUE INDEX IF NOT EXISTS uq_google_conversion_order
  ON crm.google_conversion(company_id, conversion_action_ref, order_id);

ALTER TABLE crm.google_conversion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_select ON crm.google_conversion;
DROP POLICY IF EXISTS tenant_isolation_insert ON crm.google_conversion;
DROP POLICY IF EXISTS tenant_isolation_update ON crm.google_conversion;
DROP POLICY IF EXISTS service_role_bypass ON crm.google_conversion;
CREATE POLICY tenant_isolation_select ON crm.google_conversion FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
CREATE POLICY tenant_isolation_insert ON crm.google_conversion FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());
CREATE POLICY tenant_isolation_update ON crm.google_conversion FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
CREATE POLICY service_role_bypass ON crm.google_conversion FOR ALL TO service_role
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON crm.google_conversion TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_google_conversion_status ON crm.google_conversion(status, conversion_datetime);
CREATE INDEX IF NOT EXISTS idx_google_conversion_company ON crm.google_conversion(company_id, conversion_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_google_conversion_order ON crm.google_conversion(order_id) WHERE order_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Tabelas-espelho de performance (esqueleto; populadas no Sprint 2)
-- ────────────────────────────────────────────────────────────────────────────
-- Hierarquia Google Ads: Campaign → Ad Group → (Keyword p/ Search | Asset Group p/
-- Performance Max). customer_id = conta Google Ads (análogo a ad_account_id no Meta).
-- Budgets/contadores em micros (padrão Google). NÃO usar para status/budget como
-- fonte de verdade — é um snapshot, com last_synced_at explícito.

-- 3.1) Campanhas
CREATE TABLE IF NOT EXISTS crm.google_campaign (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  customer_id text NOT NULL,
  external_campaign_id text NOT NULL,
  resource_name text,
  name text NOT NULL,
  status text,
  advertising_channel_type text,
  bidding_strategy_type text,
  budget_amount_micros bigint,
  start_date date,
  end_date date,
  impressions bigint,
  clicks bigint,
  cost_micros bigint,
  conversions numeric(14,2),
  conversions_value numeric(14,2),
  metrics jsonb,
  raw jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_campaign_id)
);
COMMENT ON TABLE crm.google_campaign IS 'Snapshot de campanhas Google (Sprint 2). NÃO é source of truth para status/budget.';

-- 3.2) Ad groups
CREATE TABLE IF NOT EXISTS crm.google_ad_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  customer_id text NOT NULL,
  external_campaign_id text,
  external_ad_group_id text NOT NULL,
  resource_name text,
  name text NOT NULL,
  status text,
  type text,
  impressions bigint,
  clicks bigint,
  cost_micros bigint,
  conversions numeric(14,2),
  conversions_value numeric(14,2),
  metrics jsonb,
  raw jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_ad_group_id)
);
COMMENT ON TABLE crm.google_ad_group IS 'Snapshot de ad groups Google (Sprint 2). NÃO é source of truth.';

-- 3.3) Keywords (Search)
CREATE TABLE IF NOT EXISTS crm.google_keyword (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  customer_id text NOT NULL,
  external_ad_group_id text,
  external_criterion_id text NOT NULL,
  resource_name text,
  keyword_text text,
  match_type text,
  status text,
  impressions bigint,
  clicks bigint,
  cost_micros bigint,
  conversions numeric(14,2),
  conversions_value numeric(14,2),
  metrics jsonb,
  raw jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_ad_group_id, external_criterion_id)
);
COMMENT ON TABLE crm.google_keyword IS 'Snapshot de keywords Google Search (Sprint 2). NÃO é source of truth.';

-- 3.4) Asset groups (Performance Max)
CREATE TABLE IF NOT EXISTS crm.google_asset_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  customer_id text NOT NULL,
  external_campaign_id text,
  external_asset_group_id text NOT NULL,
  resource_name text,
  name text NOT NULL,
  status text,
  impressions bigint,
  clicks bigint,
  cost_micros bigint,
  conversions numeric(14,2),
  conversions_value numeric(14,2),
  metrics jsonb,
  raw jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_asset_group_id)
);
COMMENT ON TABLE crm.google_asset_group IS 'Snapshot de asset groups Google Performance Max (Sprint 2). NÃO é source of truth.';

-- RLS + GRANTs para as 4 tabelas-espelho (mesmo padrão das crm.meta_*).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['google_campaign','google_ad_group','google_keyword','google_asset_group']
  LOOP
    EXECUTE format('ALTER TABLE crm.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON crm.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON crm.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_update ON crm.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS service_role_bypass ON crm.%I;', t);
    EXECUTE format('CREATE POLICY tenant_isolation_select ON crm.%I FOR SELECT TO authenticated USING (company_id = public.current_company_id());', t);
    EXECUTE format('CREATE POLICY tenant_isolation_insert ON crm.%I FOR INSERT TO authenticated WITH CHECK (company_id = public.current_company_id());', t);
    EXECUTE format('CREATE POLICY tenant_isolation_update ON crm.%I FOR UPDATE TO authenticated USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());', t);
    EXECUTE format('CREATE POLICY service_role_bypass ON crm.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON crm.%I TO authenticated, service_role;', t);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_google_campaign_company ON crm.google_campaign(company_id, last_synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_campaign_customer ON crm.google_campaign(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_google_ad_group_company ON crm.google_ad_group(company_id, last_synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_ad_group_campaign ON crm.google_ad_group(external_campaign_id);
CREATE INDEX IF NOT EXISTS idx_google_keyword_company ON crm.google_keyword(company_id, last_synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_keyword_ad_group ON crm.google_keyword(external_ad_group_id);
CREATE INDEX IF NOT EXISTS idx_google_asset_group_company ON crm.google_asset_group(company_id, last_synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_asset_group_campaign ON crm.google_asset_group(external_campaign_id);
