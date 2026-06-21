
-- =========================================================================
-- crm.event_commercial_context (1 linha por evento)
-- =========================================================================
CREATE TABLE IF NOT EXISTS crm.event_commercial_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id uuid NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  lote_atual text NULL,
  virada_iminente boolean NOT NULL DEFAULT false,
  virada_data date NULL,
  preco_atual numeric NULL,
  moeda text NULL,
  angulo_fase text NULL,
  notas text NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_commercial_context_company_idx
  ON crm.event_commercial_context (company_id);
CREATE INDEX IF NOT EXISTS event_commercial_context_event_idx
  ON crm.event_commercial_context (event_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON crm.event_commercial_context TO authenticated;
GRANT ALL ON crm.event_commercial_context TO service_role;

ALTER TABLE crm.event_commercial_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_bypass
  ON crm.event_commercial_context
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY tenant_isolation_select
  ON crm.event_commercial_context
  FOR SELECT TO authenticated
  USING (company_id = current_company_id());

CREATE POLICY tenant_isolation_insert
  ON crm.event_commercial_context
  FOR INSERT TO authenticated
  WITH CHECK (company_id = current_company_id());

CREATE POLICY tenant_isolation_update
  ON crm.event_commercial_context
  FOR UPDATE TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

CREATE POLICY tenant_isolation_delete
  ON crm.event_commercial_context
  FOR DELETE TO authenticated
  USING (company_id = current_company_id());

-- =========================================================================
-- crm.event_commercial_context_log (append-only)
-- =========================================================================
CREATE TABLE IF NOT EXISTS crm.event_commercial_context_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id uuid NOT NULL,
  context_id uuid NOT NULL REFERENCES crm.event_commercial_context(id) ON DELETE CASCADE,
  changed_by uuid NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_state jsonb NULL,
  new_state jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS event_commercial_context_log_event_idx
  ON crm.event_commercial_context_log (event_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS event_commercial_context_log_context_idx
  ON crm.event_commercial_context_log (context_id, changed_at DESC);

GRANT SELECT ON crm.event_commercial_context_log TO authenticated;
GRANT ALL ON crm.event_commercial_context_log TO service_role;

ALTER TABLE crm.event_commercial_context_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_bypass
  ON crm.event_commercial_context_log
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY tenant_isolation_select
  ON crm.event_commercial_context_log
  FOR SELECT TO authenticated
  USING (company_id = current_company_id());

-- =========================================================================
-- Trigger: updated_at em cada UPDATE
-- =========================================================================
CREATE OR REPLACE FUNCTION crm.event_commercial_context_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, crm
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_commercial_context_updated_at
  ON crm.event_commercial_context;
CREATE TRIGGER trg_event_commercial_context_updated_at
  BEFORE UPDATE ON crm.event_commercial_context
  FOR EACH ROW EXECUTE FUNCTION crm.event_commercial_context_set_updated_at();

-- =========================================================================
-- Trigger: log automático (SECURITY DEFINER para contornar RLS de escrita)
-- =========================================================================
CREATE OR REPLACE FUNCTION crm.event_commercial_context_write_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, crm
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO crm.event_commercial_context_log (
    company_id, event_id, context_id, changed_by, old_state, new_state
  ) VALUES (
    NEW.company_id, NEW.event_id, NEW.id, NEW.updated_by, v_old, v_new
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_commercial_context_log
  ON crm.event_commercial_context;
CREATE TRIGGER trg_event_commercial_context_log
  AFTER INSERT OR UPDATE ON crm.event_commercial_context
  FOR EACH ROW EXECUTE FUNCTION crm.event_commercial_context_write_log();
