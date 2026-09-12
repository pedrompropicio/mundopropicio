ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('transfer','service_payment','direct_debit','state_payment','compensation'));

ALTER TABLE public.transaction_payments
  ADD CONSTRAINT transaction_payments_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('transfer','service_payment','direct_debit','state_payment','compensation'));