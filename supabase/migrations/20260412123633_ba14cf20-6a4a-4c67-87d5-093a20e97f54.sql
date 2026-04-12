-- Add is_transitory flag to transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_transitory boolean NOT NULL DEFAULT false;

-- Add is_transitory flag to event_forecasts
ALTER TABLE public.event_forecasts ADD COLUMN IF NOT EXISTS is_transitory boolean NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.transactions.is_transitory IS 'Transação transitória (cauções, depósitos) - não impacta resultado DRE/PL mas aparece no fecho de sócios';
COMMENT ON COLUMN public.event_forecasts.is_transitory IS 'Previsão transitória (cauções, depósitos) - não impacta resultado DRE/PL';