-- 1) Schema
CREATE SCHEMA IF NOT EXISTS crm;
GRANT USAGE ON SCHEMA crm TO authenticated, service_role;

-- 2) Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 3) Table
CREATE TABLE crm.ad_platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok')),
  external_business_id TEXT NOT NULL,
  external_business_name TEXT,
  access_token_encrypted TEXT NOT NULL,
  token_type TEXT NOT NULL CHECK (token_type IN ('system_user', 'long_lived_user', 'short_lived_user')),
  expires_at TIMESTAMPTZ,
  selected_ad_account_id TEXT,
  selected_ad_account_name TEXT,
  available_ad_accounts JSONB,
  selected_page_id TEXT,
  selected_instagram_id TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  last_validated_at TIMESTAMPTZ,
  last_error TEXT,
  consecutive_failures INT DEFAULT 0,
  connected_by UUID REFERENCES public.profiles(id),
  connected_at TIMESTAMPTZ DEFAULT now(),
  disconnected_at TIMESTAMPTZ,
  CONSTRAINT one_active_per_company_platform UNIQUE (company_id, platform) DEFERRABLE INITIALLY DEFERRED
);

-- 4) Indexes
CREATE INDEX idx_connections_company ON crm.ad_platform_connections (company_id);
CREATE INDEX idx_connections_platform_status ON crm.ad_platform_connections (platform, status);
CREATE INDEX idx_connections_expires_at ON crm.ad_platform_connections (expires_at) WHERE expires_at IS NOT NULL;

-- 5) Comment
COMMENT ON TABLE crm.ad_platform_connections IS 'OAuth connections to ad platforms (Meta, Google). Tokens encrypted at column level. See ARCHITECTURE.md ADR-010.';

-- 6) RLS
ALTER TABLE crm.ad_platform_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON crm.ad_platform_connections
  FOR SELECT
  USING (company_id = current_setting('app.company_id', true)::uuid);

CREATE POLICY tenant_isolation_insert ON crm.ad_platform_connections
  FOR INSERT
  WITH CHECK (company_id = current_setting('app.company_id', true)::uuid);

CREATE POLICY tenant_isolation_update ON crm.ad_platform_connections
  FOR UPDATE
  USING (company_id = current_setting('app.company_id', true)::uuid)
  WITH CHECK (company_id = current_setting('app.company_id', true)::uuid);

CREATE POLICY service_role_bypass ON crm.ad_platform_connections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);