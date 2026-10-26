-- P3 passo 1 — contratos de pagamento por sócio (tabelas). PREPARADO, NÃO APLICADO.
-- Escrita só por RPC (passo 3); leitura por empresa, igual a cache_payment_contracts.
CREATE TABLE public.partner_payment_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  settlement_id uuid NOT NULL REFERENCES public.event_settlements(id),
  participant_id uuid NOT NULL REFERENCES public.event_settlement_participants(id),
  event_id uuid NOT NULL REFERENCES public.events(id),
  direction text NOT NULL DEFAULT 'out' CHECK (direction = 'out'),
  beneficiary_supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  gross numeric(14,2) NOT NULL CHECK (gross > 0),
  withholding_applies boolean NOT NULL,
  withholding_rate numeric(5,2) CHECK (withholding_rate IS NULL OR (withholding_rate > 0 AND withholding_rate < 100)),
  withholding_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (withholding_amount >= 0),
  withholding_due_date date,
  due_date date NOT NULL,
  advances_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (advances_amount >= 0),
  balance_tx_id uuid REFERENCES public.transactions(id),
  withholding_tx_id uuid REFERENCES public.transactions(id),
  label text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  replaced_by uuid REFERENCES public.partner_payment_contracts(id),
  CONSTRAINT ppc_withholding_shape CHECK (
    (withholding_applies AND withholding_rate IS NOT NULL AND withholding_due_date IS NOT NULL)
    OR (NOT withholding_applies AND withholding_rate IS NULL AND withholding_amount = 0 AND withholding_tx_id IS NULL)),
  CONSTRAINT ppc_amounts CHECK (withholding_amount + advances_amount <= gross)
);
CREATE UNIQUE INDEX ppc_idempotency_uq ON public.partner_payment_contracts(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX ppc_participant_active_idx ON public.partner_payment_contracts(participant_id) WHERE cancelled_at IS NULL;
CREATE INDEX ppc_settlement_idx ON public.partner_payment_contracts(settlement_id);

GRANT SELECT ON public.partner_payment_contracts TO authenticated;
GRANT ALL ON public.partner_payment_contracts TO service_role;
ALTER TABLE public.partner_payment_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY partner_contracts_select ON public.partner_payment_contracts
  FOR SELECT TO authenticated
  USING ((company_id = public.current_company_id()) OR public.is_platform_admin());

ALTER TABLE public.transactions
  ADD COLUMN partner_contract_id uuid REFERENCES public.partner_payment_contracts(id),
  ADD COLUMN partner_contract_role text CHECK (partner_contract_role IS NULL OR partner_contract_role IN ('balance','withholding','advance'));
CREATE INDEX transactions_partner_contract_idx ON public.transactions(partner_contract_id) WHERE partner_contract_id IS NOT NULL;

COMMENT ON TABLE public.partner_payment_contracts IS 'P3: até 4 contratos ativos por sócio congelado; parte = frozen_values->>share_amount; direction in fica para o P4 (10.1.06).';
