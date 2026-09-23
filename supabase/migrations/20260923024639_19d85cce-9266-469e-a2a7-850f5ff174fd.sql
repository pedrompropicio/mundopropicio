-- #209 — Retenção de criativos Meta: registo ficheiro-a-ficheiro do que foi apagado.
--
-- Uma linha por ficheiro efectivamente removido do bucket crm-meta-creatives.
-- Fechada a anon e a authenticated: só service_role (a edge function
-- crm-meta-creatives-retention) escreve e lê. Não há UI sobre esta tabela.

CREATE TABLE IF NOT EXISTS crm.meta_creatives_retention_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES crm.meta_creatives_retention_runs(id) ON DELETE SET NULL,
  company_id uuid,
  path text NOT NULL,
  grupo text NOT NULL,
  bytes bigint NOT NULL DEFAULT 0,
  creative_id uuid,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_creatives_retention_log_run_idx
  ON crm.meta_creatives_retention_log (run_id);
CREATE INDEX IF NOT EXISTS meta_creatives_retention_log_path_idx
  ON crm.meta_creatives_retention_log (path);

REVOKE ALL ON crm.meta_creatives_retention_log FROM PUBLIC;
REVOKE ALL ON crm.meta_creatives_retention_log FROM anon;
REVOKE ALL ON crm.meta_creatives_retention_log FROM authenticated;
GRANT ALL ON crm.meta_creatives_retention_log TO service_role;

ALTER TABLE crm.meta_creatives_retention_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_bypass ON crm.meta_creatives_retention_log;
CREATE POLICY service_role_bypass ON crm.meta_creatives_retention_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);