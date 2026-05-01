-- 1) Config Simulador: keywords de combo + categoria L2 de patrocínios
ALTER TABLE public.event_simulator_config
  ADD COLUMN IF NOT EXISTS combo_lot_keywords text NOT NULL DEFAULT 'COMBO,PASSE,2 DIAS,3 DIAS,FULL PASS',
  ADD COLUMN IF NOT EXISTS sponsor_category_l2_id uuid REFERENCES public.account_categories(id) ON DELETE SET NULL;

-- 2) Cost lines: cenário "Atual" (TX reais + BP aprovado sem TX)
ALTER TABLE public.event_simulator_cost_lines
  ADD COLUMN IF NOT EXISTS actual_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_paid numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_committed_bp numeric(14,2) NOT NULL DEFAULT 0;

-- 3) Lotes: nº de dias a que dão acesso (combos)
ALTER TABLE public.event_ticket_lots
  ADD COLUMN IF NOT EXISTS applies_to_days integer NOT NULL DEFAULT 1 CHECK (applies_to_days >= 1 AND applies_to_days <= 31);

COMMENT ON COLUMN public.event_simulator_config.combo_lot_keywords IS 'CSV de palavras-chave (case-insensitive) usadas pelo Simulador para detetar combos multi-dia pelo nome do lote (event_ticket_lots.name). Usado quando event_ticket_lots.applies_to_days = 1 (default).';
COMMENT ON COLUMN public.event_simulator_config.sponsor_category_l2_id IS 'Categoria L2 do plano de contas (ex: 1.2) cujas filhas L3 são tratadas como Patrocínio/Apoio no Simulador. Se NULL, infere por code LIKE ''1.2%''.';
COMMENT ON COLUMN public.event_ticket_lots.applies_to_days IS 'Número de dias do evento a que este bilhete dá acesso. Default 1 (bilhete normal). 2+ indica combo: na contagem de público diário do Simulador, 1 venda conta como 1 pessoa em CADA dia do combo. Override explícito da heurística por nome.';
COMMENT ON COLUMN public.event_simulator_cost_lines.actual_amount IS 'Cenário "Atual" no Simulador Coala: transações reais (qualquer status) + BP aprovado ainda sem transação vinculada para esta categoria. Sincronizado por syncSimulatorFromSources.';