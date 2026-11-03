-- 0304 — Issue #498: FX de pagamentos comparado com a moeda nativa da empresa.
-- Data: 2026-11-03. Classe R2. PREPARAÇÃO: só ficheiro, sem executar.
-- Aplicação: janela Claude via PROC-promocao, depois da 0303, com "Sim" do Pedro.
-- Conferência Live fornecida pelo despacho (02/11/2026):
-- transaction_payments_fx_required, validada:
-- CHECK (currency = 'EUR' OR (original_amount IS NOT NULL AND fx_rate IS NOT NULL)).
-- Schema local: 20260415194439 cria transaction_id; 20260429023352 acrescenta
-- transaction_payments.company_id; 20260918202957 cria currency e o CHECK acima.
-- Resolve via transação para impedir que company_id divergente escolha outra moeda.
-- SECURITY INVOKER: respeita RLS; ausência de empresa/moeda legível recusa a escrita.
-- Não faz backfill, conversão ou alteração de standalone_invoices_fx_required.
BEGIN;
CREATE FUNCTION public.issue498_validate_payment_native_fx()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  native_currency text;
  parent_company_id uuid;
BEGIN
  SELECT c.currency, t.company_id INTO native_currency, parent_company_id
  FROM public.transactions t
  JOIN public.companies c ON c.id = t.company_id
  WHERE t.id = NEW.transaction_id;

  IF parent_company_id IS NULL OR NEW.company_id IS DISTINCT FROM parent_company_id
     OR native_currency IS NULL OR btrim(native_currency) = '' OR NEW.currency IS NULL THEN
    RAISE EXCEPTION 'Empresa ou moeda do pagamento indisponível ou divergente'
      USING ERRCODE = '23514', CONSTRAINT = 'transaction_payments_native_fx_required';
  END IF;
  IF NEW.currency <> native_currency AND (NEW.original_amount IS NULL OR NEW.fx_rate IS NULL) THEN
    RAISE EXCEPTION 'Pagamento em moeda diferente da empresa exige original_amount e fx_rate'
      USING ERRCODE = '23514', CONSTRAINT = 'transaction_payments_native_fx_required';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.issue498_validate_payment_native_fx() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue498_validate_payment_native_fx() TO service_role;
CREATE TRIGGER zz_issue498_payment_native_fx
BEFORE INSERT OR UPDATE ON public.transaction_payments
FOR EACH ROW EXECUTE FUNCTION public.issue498_validate_payment_native_fx();
ALTER TABLE public.transaction_payments DROP CONSTRAINT transaction_payments_fx_required;
COMMIT;

-- ROLLBACK COMENTADO — o CHECK antigo pode recusar pagamentos BRL nativos criados entretanto.
-- Não fabricar original_amount/fx_rate nem alterar pagamentos para forçar o rollback.
-- A transação abaixo mantém a proteção nova se a reposição validada falhar.
-- BEGIN;
-- ALTER TABLE public.transaction_payments ADD CONSTRAINT transaction_payments_fx_required
--   CHECK (currency = 'EUR' OR (original_amount IS NOT NULL AND fx_rate IS NOT NULL));
-- DROP TRIGGER zz_issue498_payment_native_fx ON public.transaction_payments;
-- DROP FUNCTION public.issue498_validate_payment_native_fx();
-- COMMIT;
