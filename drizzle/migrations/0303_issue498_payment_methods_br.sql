-- 0303 — Issue #498 P2h: meios de pagamento BR e conta bancária da empresa.
-- Data: 2026-11-03. Classe R2. PREPARAÇÃO: só ficheiro, sem executar.
-- Aplicação: janela Claude, PROC-promocao (mp-homolog-3 → Live com "Sim" do Pedro).
-- Aditiva, sem backfill; não altera dados existentes nem políticas RLS.
-- Conferência Live fornecida pelo despacho, SELECT de 02/11/2026:
-- transactions_payment_method_check:
-- CHECK ((payment_method IS NULL) OR (payment_method = ANY (ARRAY['transfer'::text,
-- 'service_payment'::text, 'direct_debit'::text, 'state_payment'::text, 'compensation'::text])))
-- transaction_payments_payment_method_check:
-- CHECK ((payment_method IS NULL) OR (payment_method = ANY (ARRAY['transfer'::text,
-- 'service_payment'::text, 'direct_debit'::text, 'state_payment'::text, 'compensation'::text])))
-- companies.country/currency e financial_accounts existem no schema local.
-- Não renomear compensation: trg_force_no_account_on_compensation depende destes bytes.
BEGIN;
ALTER TABLE public.transactions DROP CONSTRAINT transactions_payment_method_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_payment_method_check
  CHECK (payment_method IS NULL OR payment_method = ANY(ARRAY[
    'transfer', 'service_payment', 'direct_debit', 'state_payment', 'compensation', 'pix', 'boleto'
  ]));
ALTER TABLE public.transaction_payments DROP CONSTRAINT transaction_payments_payment_method_check;
ALTER TABLE public.transaction_payments ADD CONSTRAINT transaction_payments_payment_method_check
  CHECK (payment_method IS NULL OR payment_method = ANY(ARRAY[
    'transfer', 'service_payment', 'direct_debit', 'state_payment', 'compensation', 'pix', 'boleto'
  ]));
-- IS NOT NULL fecha o bypass de CHECK por UNKNOWN quando a referência está ausente.
ALTER TABLE public.transactions ADD CONSTRAINT transactions_boleto_requires_linha
  CHECK (payment_method <> 'boleto' OR (payment_reference IS NOT NULL AND payment_reference ~ '^\d{47,48}$')) NOT VALID;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS bank_details_br jsonb NULL;
COMMENT ON COLUMN public.financial_accounts.bank_details_br IS
  'Conta BR (números como texto, preservando zeros): {bank_name: banco, routing_number: agencia, account_number: conta, account_digit: digito, account_kind: corrente|poupanca, pix_key: chave Pix}. NULL quando ausente. O mesmo detalhe no fornecedor vive no elemento account_type=br_banco_agencia_conta (slot 1|2|3) de foreign_bank_accounts da 0302; não guardar em iban.';
COMMIT;

-- ROLLBACK COMENTADO — conferir antes que pix/boleto não estão em uso; não apagar dados.
-- Se houver novos métodos em uso, a reposição dos CHECKs falha e a transação reverte.
-- BEGIN;
-- ALTER TABLE public.transactions DROP CONSTRAINT transactions_boleto_requires_linha;
-- ALTER TABLE public.transactions DROP CONSTRAINT transactions_payment_method_check;
-- ALTER TABLE public.transactions ADD CONSTRAINT transactions_payment_method_check
--   CHECK (payment_method IS NULL OR payment_method = ANY(ARRAY['transfer','service_payment','direct_debit','state_payment','compensation']));
-- ALTER TABLE public.transaction_payments DROP CONSTRAINT transaction_payments_payment_method_check;
-- ALTER TABLE public.transaction_payments ADD CONSTRAINT transaction_payments_payment_method_check
--   CHECK (payment_method IS NULL OR payment_method = ANY(ARRAY['transfer','service_payment','direct_debit','state_payment','compensation']));
-- ALTER TABLE public.financial_accounts DROP COLUMN bank_details_br;
-- COMMIT;
