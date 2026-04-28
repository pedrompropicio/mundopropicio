ALTER TABLE public.camarim_items ADD COLUMN IF NOT EXISTS analytic_tag text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'camarim_items_analytic_tag_check'
  ) THEN
    ALTER TABLE public.camarim_items
      ADD CONSTRAINT camarim_items_analytic_tag_check
      CHECK (
        analytic_tag IS NULL OR analytic_tag IN (
          'bebidas','comida','frutas_snacks','higiene','equipa','outros'
        )
      );
  END IF;
END $$;