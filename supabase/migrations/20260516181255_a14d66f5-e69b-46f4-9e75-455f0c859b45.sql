
-- Backfill seguro Mundo Propício: escreve event_forecasts.transaction_id
-- para TXs órfãs com match 1:1 (cat+event ↔ 1 única linha BP livre).
-- Idempotente: se já foi corrido, simplesmente não encontra mais candidatos.

DO $$
DECLARE
  v_company_id uuid;
  v_total_candidates int := 0;
  v_updated int := 0;
  v_rejected int := 0;
  v_rec RECORD;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE slug = 'mundo-propicio';
  IF v_company_id IS NULL THEN
    RAISE NOTICE 'Mundo Propício não existe nesta DB — backfill saltado';
    RETURN;
  END IF;

  CREATE TEMP TABLE _bf_candidates ON COMMIT DROP AS
  WITH mp_tx AS (
    SELECT t.id AS tx_id, t.event_id, t.category_id, t.type
    FROM public.transactions t
    WHERE t.company_id = v_company_id
      AND t.event_id IS NOT NULL
      AND t.category_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.event_forecasts ef WHERE ef.transaction_id = t.id)
  ),
  matches AS (
    SELECT m.tx_id,
           (SELECT array_agg(f.id) FROM public.event_forecasts f
             WHERE f.company_id = v_company_id
               AND f.event_id = m.event_id
               AND f.category_id = m.category_id
               AND f.type = m.type
               AND f.transaction_id IS NULL) AS bp_ids
    FROM mp_tx m
  )
  SELECT tx_id, bp_ids[1] AS bp_id
  FROM matches
  WHERE bp_ids IS NOT NULL AND array_length(bp_ids, 1) = 1;

  SELECT count(*) INTO v_total_candidates FROM _bf_candidates;
  RAISE NOTICE 'Candidatos 1:1 encontrados: %', v_total_candidates;

  FOR v_rec IN SELECT tx_id, bp_id FROM _bf_candidates LOOP
    BEGIN
      -- Validação L2 defensiva (mesma função do trigger)
      IF NOT public.validate_tx_category_l2_match(
        (SELECT category_id FROM public.transactions WHERE id = v_rec.tx_id),
        v_rec.bp_id
      ) THEN
        v_rejected := v_rejected + 1;
        RAISE NOTICE 'REJEITADO L2 mismatch: tx=% bp=%', v_rec.tx_id, v_rec.bp_id;
        CONTINUE;
      END IF;

      UPDATE public.event_forecasts
         SET transaction_id = v_rec.tx_id
       WHERE id = v_rec.bp_id
         AND transaction_id IS NULL;

      IF FOUND THEN v_updated := v_updated + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_rejected := v_rejected + 1;
      RAISE NOTICE 'ERRO ao ligar tx=% bp=%: %', v_rec.tx_id, v_rec.bp_id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Backfill MP concluído: % FKs escritas, % rejeitadas (de % candidatos)',
    v_updated, v_rejected, v_total_candidates;
END $$;

-- ============================================================
-- Tabela: bp_tx_reconciliation_ignored
-- Persiste decisões "TX órfã legítima" para excluir da página de reconciliação
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bp_tx_reconciliation_ignored (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  ignored_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ignored_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_bp_tx_recon_ignored_company
  ON public.bp_tx_reconciliation_ignored(company_id);

ALTER TABLE public.bp_tx_reconciliation_ignored ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bp_tx_recon_ignored_select_company"
  ON public.bp_tx_reconciliation_ignored;
CREATE POLICY "bp_tx_recon_ignored_select_company"
  ON public.bp_tx_reconciliation_ignored FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
  );

DROP POLICY IF EXISTS "bp_tx_recon_ignored_modify_admin_manager"
  ON public.bp_tx_reconciliation_ignored;
CREATE POLICY "bp_tx_recon_ignored_modify_admin_manager"
  ON public.bp_tx_reconciliation_ignored FOR ALL TO authenticated
  USING (
    (company_id = public.current_company_id()
     AND (public.has_role(auth.uid(),'admin'::app_role)
          OR public.has_role(auth.uid(),'manager'::app_role)))
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
  )
  WITH CHECK (
    (company_id = public.current_company_id()
     AND (public.has_role(auth.uid(),'admin'::app_role)
          OR public.has_role(auth.uid(),'manager'::app_role)))
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
  );

-- Auto-preencher company_id em INSERT se vazio (mesmo padrão de outras tabelas)
CREATE OR REPLACE FUNCTION public.bp_tx_recon_ignored_set_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_company_id();
  END IF;
  IF NEW.ignored_by IS NULL THEN
    NEW.ignored_by := auth.uid();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bp_tx_recon_ignored_set_company
  ON public.bp_tx_reconciliation_ignored;
CREATE TRIGGER trg_bp_tx_recon_ignored_set_company
  BEFORE INSERT ON public.bp_tx_reconciliation_ignored
  FOR EACH ROW EXECUTE FUNCTION public.bp_tx_recon_ignored_set_company();
