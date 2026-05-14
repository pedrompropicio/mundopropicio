-- Funnel Test 360 — Fase 2: tracking de event_id por run.
--
-- Adiciona FK opcional `event_id` em crm.funnel_test_runs para permitir
-- "todas as runs deste evento" (cross-run analytics por evento próprio MP).
--
-- ON DELETE SET NULL: se evento for apagado, runs históricas mantêm-se
-- (target_url + outros dados preservados); só perdem o link.
--
-- Backwards-compatible: nullable, sem default. Runs históricas
-- pré-Fase-2 mantêm event_id=NULL.

-- Nota: PostgreSQL `ADD COLUMN IF NOT EXISTS ... REFERENCES ...` é ambíguo —
-- a clause REFERENCES pode ser silenciosamente ignorada se a coluna já existe.
-- Separamos column-add e FK-add para garantir idempotência total.
ALTER TABLE crm.funnel_test_runs
  ADD COLUMN IF NOT EXISTS event_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'funnel_test_runs_event_id_fkey'
      AND conrelid = 'crm.funnel_test_runs'::regclass
  ) THEN
    ALTER TABLE crm.funnel_test_runs
      ADD CONSTRAINT funnel_test_runs_event_id_fkey
      FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN crm.funnel_test_runs.event_id IS
  'FK ao evento da plataforma MP (public.events.id). NULL para runs com URL ad-hoc/manual ou pré-Fase-2.';

CREATE INDEX IF NOT EXISTS idx_funnel_runs_event_id
  ON crm.funnel_test_runs (event_id)
  WHERE event_id IS NOT NULL;
