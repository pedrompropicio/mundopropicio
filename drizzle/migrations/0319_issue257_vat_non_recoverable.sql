-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS vat_non_recoverable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.transactions.vat_non_recoverable IS
  '#257 (D-ERP347): true = IVA não recuperável (ex.: estrangeiro), vai ao custo; valor = amount × iva_rate/100. Leituras por ligar (#218/#415).';
