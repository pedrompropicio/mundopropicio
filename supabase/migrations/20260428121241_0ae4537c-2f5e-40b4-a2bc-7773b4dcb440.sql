-- Adicionar flag is_hidden a financial_accounts para excluir contas de uso restrito (ex: "Eventos Históricos")
-- dos seletores normais. Continua válida para histórico, mas não aparece nas listas para utilizadores criarem novos movimentos.
ALTER TABLE public.financial_accounts
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.financial_accounts.is_hidden IS
'Quando true, a conta não é oferecida em seletores de novas transações (camarim, reembolso, adiantamentos, etc.). Mantém-se disponível para reportes e fluxos administrativos especiais.';

-- Marcar a conta "Eventos Históricos" como hidden por defeito.
UPDATE public.financial_accounts
SET is_hidden = true
WHERE name = 'Eventos Históricos';
