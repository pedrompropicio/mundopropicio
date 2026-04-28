-- Migrar items existentes: frutas_snacks → comida
UPDATE public.camarim_items SET analytic_tag = 'comida' WHERE analytic_tag = 'frutas_snacks';

-- Recriar check constraint sem 'frutas_snacks'
ALTER TABLE public.camarim_items DROP CONSTRAINT IF EXISTS camarim_items_analytic_tag_check;
ALTER TABLE public.camarim_items ADD CONSTRAINT camarim_items_analytic_tag_check
CHECK (
  analytic_tag IS NULL
  OR analytic_tag IN ('bebidas','comida','higiene','equipa','outros')
);

COMMENT ON COLUMN public.camarim_items.analytic_tag IS
  'Tag analítica opcional usada apenas no dossier contabilístico do Camarim. Não afeta a categoria contabilística da transação (sempre 2.6.04 — Camarins). Valores: bebidas | comida (inclui frutas e snacks) | higiene | equipa | outros.';