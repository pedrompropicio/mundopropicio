-- 1. Adicionar campos de adiantamento e fecho à sessão
ALTER TABLE public.camarim_sessions
  ADD COLUMN IF NOT EXISTS advance_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spent_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_transaction_id uuid NULL,
  ADD COLUMN IF NOT EXISTS settlement_type text NULL CHECK (settlement_type IN ('refund','reinforcement','balanced'));

-- 2. Adicionar status 'pending_review' como possível status de item (texto livre — sem constraint).
--    Os itens parqueados (sem documento) ficam com status='pending_review'.
--    Adicionar campo de justificativa do manager para aprovar sem documento.
ALTER TABLE public.camarim_items
  ADD COLUMN IF NOT EXISTS pending_review_reason text NULL,
  ADD COLUMN IF NOT EXISTS approved_without_document boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_without_document_reason text NULL;

-- 3. Índice para acelerar lookup de itens parqueados por sessão
CREATE INDEX IF NOT EXISTS idx_camarim_items_session_status
  ON public.camarim_items(session_id, status);