
ALTER TABLE public.camarim_fund_moves
  ADD COLUMN IF NOT EXISTS transaction_id uuid
    REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_camarim_fund_moves_transaction
  ON public.camarim_fund_moves(transaction_id);
