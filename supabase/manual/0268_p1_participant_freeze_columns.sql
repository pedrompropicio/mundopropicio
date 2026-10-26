-- P1 passo 1 (0268): colunas de congelamento por sócio. Nullable, sem DEFAULT; linhas existentes ficam descongeladas.
ALTER TABLE public.event_settlement_participants
  ADD COLUMN frozen_at timestamptz,
  ADD COLUMN frozen_by uuid,
  ADD COLUMN frozen_values jsonb,
  ADD COLUMN freeze_note text;
