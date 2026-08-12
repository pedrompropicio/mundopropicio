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
    COALESCE(NULLIF(btrim(t.iban_override), ''), '') <> ''
    OR COALESCE(NULLIF(btrim(s.iban), ''), '') <> ''
    OR COALESCE(NULLIF(btrim(s.iban_2), ''), '') <> ''
    OR COALESCE(NULLIF(btrim(s.iban_3), ''), '') <> ''
    OR COALESCE(NULLIF(btrim(t.payment_entity), ''), '') <> ''
    OR COALESCE(NULLIF(btrim(t.payment_reference), ''), '') <> ''
  INTO v_ok
  FROM public.transactions t
  LEFT JOIN public.suppliers s ON s.id = t.supplier_id
  WHERE t.id = NEW.transaction_id;

  IF v_ok IS NULL THEN
    RAISE EXCEPTION 'Transação não encontrada para adicionar à lista de pagamento';
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Transação sem IBAN resolvível não pode entrar em lista de pagamento';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_list_items_bankable ON public.payment_list_items;
CREATE TRIGGER trg_payment_list_items_bankable
BEFORE INSERT ON public.payment_list_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_list_item_bankable();