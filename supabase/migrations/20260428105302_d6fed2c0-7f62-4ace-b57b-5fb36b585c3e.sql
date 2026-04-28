-- Migrar dados antigos para os novos nomes (caso existam registos pré-existentes)
UPDATE public.camarim_fund_moves SET move_type = 'reinforcement' WHERE move_type = 'cash_reinforcement';
UPDATE public.camarim_fund_moves SET move_type = 'refund' WHERE move_type IN ('refund_to_company', 'reimbursement_to_buyer');
UPDATE public.camarim_fund_moves SET move_type = 'adjustment' WHERE move_type IN ('manual_adjustment', 'company_card_use');

-- Substituir o check constraint
ALTER TABLE public.camarim_fund_moves DROP CONSTRAINT IF EXISTS camarim_fund_moves_type_check;
ALTER TABLE public.camarim_fund_moves
  ADD CONSTRAINT camarim_fund_moves_type_check
  CHECK (move_type = ANY (ARRAY['advance'::text, 'reinforcement'::text, 'refund'::text, 'adjustment'::text]));