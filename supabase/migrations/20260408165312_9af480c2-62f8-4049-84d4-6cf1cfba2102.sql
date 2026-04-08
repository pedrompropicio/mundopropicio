-- Add parent_transaction_id for split/apportionment support
ALTER TABLE public.transactions
ADD COLUMN parent_transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE DEFAULT NULL;

-- Add split percentage for each child transaction
ALTER TABLE public.transactions
ADD COLUMN split_percentage numeric DEFAULT NULL;

-- Index for efficient lookup of child transactions
CREATE INDEX idx_transactions_parent_id ON public.transactions(parent_transaction_id) WHERE parent_transaction_id IS NOT NULL;