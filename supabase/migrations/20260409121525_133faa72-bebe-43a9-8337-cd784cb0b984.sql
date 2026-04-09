ALTER TABLE public.financial_accounts
ADD COLUMN skip_balance_check boolean NOT NULL DEFAULT false;