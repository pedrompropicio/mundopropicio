-- CRM/Ads audit log (partitioned monthly)
CREATE TABLE crm.ad_manager_audit_log (
  id BIGSERIAL,
  company_id UUID NOT NULL,
  user_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  payload_before JSONB,
  payload_after JSONB,
  ip_address INET,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

COMMENT ON TABLE crm.ad_manager_audit_log IS 'Append-only audit log. Partitioned monthly. Retain 7 years per PT financial law. See ARCHITECTURE.md section 2.6.';

-- Initial monthly partitions
CREATE TABLE crm.ad_manager_audit_log_2026_05 PARTITION OF crm.ad_manager_audit_log
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE crm.ad_manager_audit_log_2026_06 PARTITION OF crm.ad_manager_audit_log
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE crm.ad_manager_audit_log_2026_07 PARTITION OF crm.ad_manager_audit_log
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- Indexes on parent
CREATE INDEX idx_audit_company_time ON crm.ad_manager_audit_log (company_id, occurred_at DESC);
CREATE INDEX idx_audit_entity ON crm.ad_manager_audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_user ON crm.ad_manager_audit_log (user_id, occurred_at DESC);

-- RLS
ALTER TABLE crm.ad_manager_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON crm.ad_manager_audit_log
  FOR SELECT
  USING (company_id = current_setting('app.company_id', true)::uuid);

CREATE POLICY service_role_bypass ON crm.ad_manager_audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Helper function (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION crm.write_audit_log(
  p_company_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_payload_before JSONB DEFAULT NULL,
  p_payload_after JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO crm.ad_manager_audit_log (
    company_id, user_id, action, entity_type, entity_id,
    payload_before, payload_after, ip_address, user_agent
  ) VALUES (
    p_company_id, p_user_id, p_action, p_entity_type, p_entity_id,
    p_payload_before, p_payload_after, p_ip_address, p_user_agent
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION crm.write_audit_log(UUID, UUID, TEXT, TEXT, UUID, JSONB, JSONB, INET, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.write_audit_log(UUID, UUID, TEXT, TEXT, UUID, JSONB, JSONB, INET, TEXT) TO service_role;