-- 1. Adicionar flag is_overhead em event_forecasts
ALTER TABLE public.event_forecasts
  ADD COLUMN IF NOT EXISTS is_overhead boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_event_forecasts_is_overhead
  ON public.event_forecasts(is_overhead) WHERE is_overhead = true;

-- 2. Migrar event_closing_costs existentes para event_forecasts (preservando o id para manter anexos no bucket closing-cost-documents)
INSERT INTO public.event_forecasts (
  id,
  event_id,
  category_id,
  type,
  description,
  amount,
  iva_rate,
  notes,
  status,
  formula_type,
  formula_value,
  is_overhead,
  exclude_from_result,
  approved_at,
  approved_by,
  created_at,
  updated_at
)
SELECT
  ecc.id,
  ecc.event_id,
  ecc.category_id,
  'expense',
  ecc.description,
  ecc.amount,
  0, -- rateios internos não têm IVA
  ecc.notes,
  'approved',
  'fixed',
  ecc.amount,
  true,  -- is_overhead
  true,  -- exclude_from_result (não impacta empresa)
  now(),
  'migration:overhead',
  ecc.created_at,
  ecc.updated_at
FROM public.event_closing_costs ecc
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_forecasts ef WHERE ef.id = ecc.id
);

-- 3. Renomear bucket logicamente: já não usaremos só para "closing costs", agora é para overhead em geral.
-- Mantemos o nome do bucket para preservar URLs/anexos.
-- (Sem alteração no bucket — ficheiros continuam acessíveis pelo mesmo path.)

-- 4. Marcar event_closing_costs como deprecated (mantemos por agora para rollback de emergência)
COMMENT ON TABLE public.event_closing_costs IS 'DEPRECATED 2026-04-20: dados migrados para event_forecasts WHERE is_overhead = true. Tabela mantida temporariamente para rollback de emergência. Será removida em 2 semanas.';

-- 5. Documentar a flag
COMMENT ON COLUMN public.event_forecasts.is_overhead IS 'Linha de rateio de overhead da empresa (assessoria, jurídico, equipa estrutura). Aparece em BP/DRE como informativa, não gera transação, não impacta resultado da empresa (exclude_from_result), mas entra no acerto com sócios.';