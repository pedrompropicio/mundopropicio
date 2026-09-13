ALTER TABLE public.event_settlement_participants
  ADD COLUMN IF NOT EXISTS transfer_with_vat boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.event_settlement_participants.transfer_with_vat IS
  '(g4) Repasse ao sócio facturado com IVA: quando true, o documento do sócio e o Encontro de Contas acrescentam IVA 23% sobre a base a transferir (só quando positiva).';