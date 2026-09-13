ALTER TABLE public.event_forecasts
  ADD COLUMN IF NOT EXISTS vat_non_recoverable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.event_forecasts.vat_non_recoverable IS
  'true = o IVA desta linha e custo para os socios apurados c/IVA mas NAO e recuperado pela sociedade; fica fora do IVA dedutivel devolvido ao no que devolve IVA e cai no residual da casa (IVA nao repassado).';