-- Add optional analytic tag for accounting dossier grouping (no impact on chart of accounts)
ALTER TABLE public.camarim_items
  ADD COLUMN IF NOT EXISTS analytic_tag text;

-- Whitelist of accepted values (nullable allowed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'camarim_items_analytic_tag_check'
  ) THEN
    ALTER TABLE public.camarim_items
      ADD CONSTRAINT camarim_items_analytic_tag_check
      CHECK (
        analytic_tag IS NULL
        OR analytic_tag IN ('bebidas','comida','frutas_snacks','higiene','equipa','outros')
      );
  END IF;
END $$;

-- Helpful index for dossier aggregation per session
CREATE INDEX IF NOT EXISTS idx_camarim_items_session_tag
  ON public.camarim_items (session_id, analytic_tag);

COMMENT ON COLUMN public.camarim_items.analytic_tag IS
  'Tag analítica opcional usada apenas no dossier contabilístico do Camarim. Não afeta a categoria contabilística da transação (sempre 2.6.04 — Camarins). Valores: bebidas | comida | frutas_snacks | higiene | equipa | outros.';