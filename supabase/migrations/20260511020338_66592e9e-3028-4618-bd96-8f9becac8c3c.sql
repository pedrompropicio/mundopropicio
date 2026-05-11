-- ============================================================================
-- CRM OAuth: switch RLS policies to direct profiles.active_company_id lookup
-- ============================================================================
-- Already applied in production via MCP — this migration versions it in the
-- repo so it survives drift correction. Idempotent.
-- ============================================================================

-- ===== crm.oauth_states =====
DROP POLICY IF EXISTS insert_own_company ON crm.oauth_states;
DROP POLICY IF EXISTS select_own_company ON crm.oauth_states;

CREATE POLICY insert_own_company ON crm.oauth_states
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT active_company_id FROM public.profiles WHERE id = auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY select_own_company ON crm.oauth_states
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT active_company_id FROM public.profiles WHERE id = auth.uid())
  );

-- ===== crm.ad_platform_connections =====
DROP POLICY IF EXISTS tenant_isolation_select ON crm.ad_platform_connections;
DROP POLICY IF EXISTS tenant_isolation_insert ON crm.ad_platform_connections;
DROP POLICY IF EXISTS tenant_isolation_update ON crm.ad_platform_connections;

CREATE POLICY tenant_isolation_select ON crm.ad_platform_connections
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT active_company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY tenant_isolation_insert ON crm.ad_platform_connections
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT active_company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY tenant_isolation_update ON crm.ad_platform_connections
  FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT active_company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT active_company_id FROM public.profiles WHERE id = auth.uid())
  );

-- ===== Unique constraint required by ON CONFLICT in upsert_meta_connection =====
ALTER TABLE crm.ad_platform_connections
  DROP CONSTRAINT IF EXISTS one_active_per_company_platform;
ALTER TABLE crm.ad_platform_connections
  ADD CONSTRAINT one_active_per_company_platform UNIQUE (company_id, platform);

-- ===== crm.upsert_meta_connection — qualify pgp_sym_encrypt with extensions schema =====
CREATE OR REPLACE FUNCTION crm.upsert_meta_connection(
  p_company_id uuid,
  p_user_id uuid,
  p_external_business_id text,
  p_external_business_name text,
  p_access_token text,
  p_token_type text,
  p_expires_at timestamp with time zone,
  p_master_key text,
  p_available_ad_accounts jsonb DEFAULT NULL::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm', 'public'
AS $function$
DECLARE
  v_connection_id UUID;
  v_encrypted     TEXT;
BEGIN
  v_encrypted := encode(extensions.pgp_sym_encrypt(p_access_token, p_master_key), 'base64');

  INSERT INTO crm.ad_platform_connections (
    company_id, platform, external_business_id, external_business_name,
    access_token_encrypted, token_type, expires_at,
    available_ad_accounts, status, connected_by, connected_at,
    last_validated_at, consecutive_failures
  ) VALUES (
    p_company_id, 'meta', p_external_business_id, p_external_business_name,
    v_encrypted, p_token_type, p_expires_at,
    p_available_ad_accounts, 'active', p_user_id, now(),
    now(), 0
  )
  ON CONFLICT (company_id, platform) DO UPDATE SET
    external_business_id    = EXCLUDED.external_business_id,
    external_business_name  = EXCLUDED.external_business_name,
    access_token_encrypted  = EXCLUDED.access_token_encrypted,
    token_type              = EXCLUDED.token_type,
    expires_at              = EXCLUDED.expires_at,
    available_ad_accounts   = EXCLUDED.available_ad_accounts,
    status                  = 'active',
    connected_by            = EXCLUDED.connected_by,
    connected_at            = now(),
    disconnected_at         = NULL,
    last_validated_at       = now(),
    last_error              = NULL,
    consecutive_failures    = 0
  RETURNING id INTO v_connection_id;

  RETURN v_connection_id;
END;
$function$;