CREATE OR REPLACE FUNCTION public.enforce_payment_list_item_bankable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ok boolean;
BEGIN
  SELECT
    COALESCE(NULLIF(btrim(t.iban_override), ''), '') <> ''
    OR COALESCE(NULLIF(btrim(s.iban), ''), '') <> ''
    OR COALESCE(NULLIF(btrim(s.iban_2), ''), '') <> ''
    OR COALESCE(NULLIF(btrim(s.iban_3), ''), '') <> ''
    OR COALESCE(NULLIF(btrim(t.payment_entity), ''), '') <> ''
    OR COALESCE(NULLIF(btrim(t.payment_reference), ''), '') <> ''
    -- Carga de cartão pré-pago: beneficiário é a própria conta de destino
    OR COALESCE(NULLIF(btrim(dest.iban), ''), '') <> ''
  INTO v_ok
  FROM public.transactions t
  LEFT JOIN public.suppliers s ON s.id = t.supplier_id
  LEFT JOIN public.card_session_loads csl ON csl.out_transaction_id = t.id
  LEFT JOIN public.card_sessions cs ON cs.id = csl.session_id
  LEFT JOIN public.financial_accounts dest ON dest.id = cs.card_account_id
  WHERE t.id = NEW.transaction_id;

  IF v_ok IS NULL THEN
    RAISE EXCEPTION 'Transação não encontrada para adicionar à lista de pagamento';
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Transação sem IBAN resolvível não pode entrar em lista de pagamento';
  END IF;

  RETURN NEW;
END;
$function$;