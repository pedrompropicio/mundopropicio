ALTER TABLE public.card_sessions ALTER COLUMN opening_balance DROP NOT NULL;
ALTER TABLE public.card_sessions ALTER COLUMN opening_balance DROP DEFAULT;
COMMENT ON COLUMN public.card_sessions.opening_balance IS 'Override manual do saldo de abertura. NULL = calculado dinamicamente da conta (initial_balance + movimentos pagos com data anterior a opened_at).';