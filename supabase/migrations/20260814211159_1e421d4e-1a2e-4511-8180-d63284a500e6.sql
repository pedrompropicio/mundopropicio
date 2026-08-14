CREATE OR REPLACE FUNCTION public.enforce_payment_list_item_bankable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT
    COALESCE(NULLIF(TRIM(t.iban_override), ''), '') <> ''
    OR COALESCE(NULLIF(TRIM(s.iban), ''), '') <> ''
    OR COALESCE(NULLIF(TRIM(s.iban_2), ''), '') <> ''
    OR COALESCE(NULLIF(TRIM(s.iban_3), ''), '') <> ''
    OR COALESCE(NULLIF(TRIM(t.payment_entity), ''), '') <> ''
    OR COALESCE(NULLIF(TRIM(t.payment_reference), ''), '') <> ''
    -- Transferência interna (carga de cartão pré-pago): sempre elegível,
    -- com ou sem IBAN no cadastro da conta de destino (liquida no homebanking).
    OR csl.out_transaction_id IS NOT NULL
  INTO v_ok
  FROM public.transactions t
  LEFT JOIN public.suppliers s ON s.id = t.supplier_id
  LEFT JOIN public.card_session_loads csl ON csl.out_transaction_id = t.id
  WHERE t.id = NEW.transaction_id
  LIMIT 1;

  IF v_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Transação sem IBAN resolvível não pode entrar em lista de pagamento';
  END IF;

  RETURN NEW;
END;
$$;