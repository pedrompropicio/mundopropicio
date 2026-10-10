ALTER TABLE public.transaction_payments
  ADD COLUMN IF NOT EXISTS payment_list_id uuid NULL REFERENCES public.payment_lists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outside_batch boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.transaction_payments.payment_list_id IS '#281: lista de pagamento de onde nasceu a liquidação (NULL = liquidação avulsa).';
COMMENT ON COLUMN public.transaction_payments.outside_batch IS '#281: true = liquidada uma a uma por outro canal (Pag. Serviços/Estado/Débito Direto/fora do lote), escolhida explicitamente.';

CREATE OR REPLACE FUNCTION public.enforce_payment_list_batch_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_export boolean;
  v_in_export boolean;
  v_method text;
BEGIN
  IF NEW.payment_list_id IS NULL OR NEW.outside_batch THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payment_list_items i
    WHERE i.payment_list_id = NEW.payment_list_id
      AND i.transaction_id = NEW.transaction_id
      AND i.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Transação % não está ativa na lista de pagamento %.', NEW.transaction_id, NEW.payment_list_id
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.payment_list_sepa_exports x WHERE x.payment_list_id = NEW.payment_list_id),
         EXISTS (SELECT 1 FROM public.payment_list_sepa_exports x WHERE x.payment_list_id = NEW.payment_list_id AND NEW.transaction_id = ANY (x.transaction_ids))
    INTO v_has_export, v_in_export;

  IF v_has_export THEN
    IF NOT v_in_export THEN
      RAISE EXCEPTION 'A transação % não foi no ficheiro SEPA desta lista: liquida-se uma a uma por outro canal.', NEW.transaction_id
        USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT coalesce(t.payment_method, 'transfer') INTO v_method FROM public.transactions t WHERE t.id = NEW.transaction_id;
    IF v_method <> 'transfer' THEN
      RAISE EXCEPTION 'A transação % é paga por % — não vai no lote; liquida-se uma a uma.', NEW.transaction_id, v_method
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_payment_list_batch_channel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_payment_list_batch_channel ON public.transaction_payments;
CREATE TRIGGER trg_enforce_payment_list_batch_channel
  BEFORE INSERT ON public.transaction_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_list_batch_channel();