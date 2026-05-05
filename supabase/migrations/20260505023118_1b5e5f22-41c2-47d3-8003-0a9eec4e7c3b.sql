
-- 1. Coluna import_template em events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS import_template text;

CREATE INDEX IF NOT EXISTS idx_events_import_template
  ON public.events(import_template) WHERE import_template IS NOT NULL;

-- 2. Tabela de histórico de imports Coala
CREATE TABLE IF NOT EXISTS public.coala_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  file_version text NOT NULL,
  file_name text,
  bp_version_id uuid REFERENCES public.bp_versions(id) ON DELETE SET NULL,
  import_batch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',           -- pending | applied | rolled_back | failed
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,        -- {net, iva, gross, paid, lines, suppliers_new, ...}
  validation_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  pendencies_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_transaction_ids uuid[] NOT NULL DEFAULT '{}',
  created_forecast_ids uuid[] NOT NULL DEFAULT '{}',
  created_supplier_ids uuid[] NOT NULL DEFAULT '{}',
  applied_at timestamptz,
  rolled_back_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coala_runs_status_check CHECK (status IN ('pending','applied','rolled_back','failed'))
);

CREATE INDEX IF NOT EXISTS idx_coala_runs_event ON public.coala_import_runs(event_id);
CREATE INDEX IF NOT EXISTS idx_coala_runs_company ON public.coala_import_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_coala_runs_batch ON public.coala_import_runs(import_batch_id);

ALTER TABLE public.coala_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coala runs: company members read"
  ON public.coala_import_runs FOR SELECT TO authenticated
  USING (company_id = current_company_id());

CREATE POLICY "Coala runs: privileged write"
  ON public.coala_import_runs FOR ALL TO authenticated
  USING (
    company_id = current_company_id()
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'editor') OR has_role(auth.uid(),'platform_admin'))
  )
  WITH CHECK (
    company_id = current_company_id()
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'editor') OR has_role(auth.uid(),'platform_admin'))
  );

CREATE TRIGGER trg_coala_runs_updated
  BEFORE UPDATE ON public.coala_import_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Categoria fallback "0 A classificar > 0.0 Geral > 0.0.99 A classificar"
-- Cria a hierarquia em TODAS as companies que ainda não tenham
DO $$
DECLARE
  c RECORD;
  l1_id uuid;
  l2_id uuid;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    -- L1: "0 A classificar"
    SELECT id INTO l1_id FROM public.account_categories
      WHERE company_id = c.id AND code = '0';
    IF l1_id IS NULL THEN
      INSERT INTO public.account_categories(company_id, code, name, type, parent_id, event_required, is_active)
        VALUES (c.id, '0', 'A classificar', 'expense', NULL, false, true)
        RETURNING id INTO l1_id;
    END IF;

    -- L2: "0.0 Geral"
    SELECT id INTO l2_id FROM public.account_categories
      WHERE company_id = c.id AND code = '0.0';
    IF l2_id IS NULL THEN
      INSERT INTO public.account_categories(company_id, code, name, type, parent_id, event_required, is_active)
        VALUES (c.id, '0.0', 'Geral', 'expense', l1_id, false, true)
        RETURNING id INTO l2_id;
    END IF;

    -- L3: "0.0.99 A classificar"
    INSERT INTO public.account_categories(company_id, code, name, type, parent_id, event_required, is_active)
      VALUES (c.id, '0.0.99', 'A classificar', 'expense', l2_id, false, true)
      ON CONFLICT (company_id, code) DO NOTHING;
  END LOOP;
END $$;

-- 4. Marcar Coala Festival Portugal 2026 como template 'coala'
UPDATE public.events
   SET import_template = 'coala'
 WHERE id = '5a1da5fb-3115-4ae3-af50-15ce1f869a5c';
