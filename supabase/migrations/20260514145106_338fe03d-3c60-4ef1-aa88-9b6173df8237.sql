ALTER TABLE crm.funnel_test_runs
  ADD COLUMN IF NOT EXISTS preset_id text,
  ADD COLUMN IF NOT EXISTS preset_version text;

COMMENT ON COLUMN crm.funnel_test_runs.preset_id IS
  'Flow preset usado nesta run (ex: ticketline-pt). NULL em runs pré-Fase-1 do refactor multi-bilheteira.';

COMMENT ON COLUMN crm.funnel_test_runs.preset_version IS
  'Semver do preset config (ex: 1.0.0). Permite tracking de evolução de selectores por bilheteira.';

CREATE INDEX IF NOT EXISTS idx_funnel_runs_preset_id
  ON crm.funnel_test_runs (preset_id)
  WHERE preset_id IS NOT NULL;