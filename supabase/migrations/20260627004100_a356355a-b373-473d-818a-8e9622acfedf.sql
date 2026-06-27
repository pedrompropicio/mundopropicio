ALTER TABLE crm.meta_campaign_strategies
  ADD COLUMN IF NOT EXISTS duel_id uuid NULL,
  ADD COLUMN IF NOT EXISTS source_model text NULL,
  ADD COLUMN IF NOT EXISTS reference_campaign_id text NULL;

COMMENT ON COLUMN crm.meta_campaign_strategies.duel_id IS 'Agrupa os 2 candidatos do mesmo duelo (ex.: Gemini Pro vs GPT-5). NULL quando a geração foi single-model (sem duelo).';
COMMENT ON COLUMN crm.meta_campaign_strategies.source_model IS 'Modelo LLM que gerou esta estratégia (ex.: gemini-2.5-flash, gemini-2.5-pro, gpt-5). NULL para estratégias antigas anteriores ao tracking.';
COMMENT ON COLUMN crm.meta_campaign_strategies.reference_campaign_id IS 'Campanha-referência OPCIONAL (external_campaign_id do Meta, text livre — mesma convenção de source_campaign_id) de onde herdar vencedores (criativos/textos/audiências) no modo from-scratch. Distinta de source_campaign_id (campanha origem/diagnosticada).';

CREATE INDEX IF NOT EXISTS idx_meta_campaign_strategies_duel_id
  ON crm.meta_campaign_strategies (duel_id)
  WHERE duel_id IS NOT NULL;