ALTER TABLE public.event_cache_configs
ADD COLUMN IF NOT EXISTS agreement_notes TEXT;

COMMENT ON COLUMN public.event_cache_configs.agreement_notes IS 'Justificativa obrigatória quando adjusted_amount difere do valor calculado (ex: câmbio em fornecedores BRL, arredondamento na negociação)';
COMMENT ON COLUMN public.event_cache_configs.real_amount IS 'Snapshot do valor calculado no momento do fecho (is_finalized=true). Consumido por relatórios via getCacheEffectiveAmount quando adjusted_amount é null.';
COMMENT ON COLUMN public.event_cache_configs.adjusted_amount IS 'Valor negociado/acordado que sobrepõe o cálculo automático. Tem prioridade máxima sobre real_amount e calculado dinâmico.';