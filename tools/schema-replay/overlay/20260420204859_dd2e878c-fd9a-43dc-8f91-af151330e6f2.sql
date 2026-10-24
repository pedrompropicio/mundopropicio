-- #352 corrective iteration run40120020259, SQLSTATE42703.
-- Remove only operational INSERT SELECT backfill from event_closing_costs; retain all DDL.
-- Original unchanged. Pedro step5 iterative local replay; Codex correction pending Claude final review.
-- 1. Adicionar flag is_overhead em event_forecasts
ALTER TABLE public.event_forecasts
  ADD COLUMN IF NOT EXISTS is_overhead boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_event_forecasts_is_overhead
  ON public.event_forecasts(is_overhead) WHERE is_overhead = true;

-- 3. Renomear bucket logicamente: já não usaremos só para "closing costs", agora é para overhead em geral.
-- Mantemos o nome do bucket para preservar URLs/anexos.
-- (Sem alteração no bucket — ficheiros continuam acessíveis pelo mesmo path.)

-- 4. Marcar event_closing_costs como deprecated (mantemos por agora para rollback de emergência)
COMMENT ON TABLE public.event_closing_costs IS 'DEPRECATED 2026-04-20: dados migrados para event_forecasts WHERE is_overhead = true. Tabela mantida temporariamente para rollback de emergência. Será removida em 2 semanas.';

-- 5. Documentar a flag
COMMENT ON COLUMN public.event_forecasts.is_overhead IS 'Linha de rateio de overhead da empresa (assessoria, jurídico, equipa estrutura). Aparece em BP/DRE como informativa, não gera transação, não impacta resultado da empresa (exclude_from_result), mas entra no acerto com sócios.';
