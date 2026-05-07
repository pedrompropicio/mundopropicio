
-- ============================================================
-- Reimbursement notes: 2-step payment flow
-- approved → (Gerar TX) → pending_payment → (TX liquidada) → paid
-- ============================================================

-- 1) Trigger: quando a TX-mãe (payment_transaction_id) for paga,
--    propaga paid_amount/payment_date a todos os itens e marca a nota como Paga.
CREATE OR REPLACE FUNCTION public.reimbursement_propagate_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note RECORD;
BEGIN
  -- Só age em transições para 'paid'
  IF NEW.status IS DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_note
  FROM public.reimbursement_notes
  WHERE payment_transaction_id = NEW.id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Marca todos os itens como pagos (gross = base * (1 + iva/100))
  UPDATE public.transactions t
  SET status = 'paid',
      paid_amount = ROUND((t.amount * (1 + COALESCE(t.iva_rate,0)/100))::numeric, 2),
      payment_date = COALESCE(NEW.payment_date, CURRENT_DATE),
      updated_at = now()
  FROM public.reimbursement_note_items i
  WHERE i.transaction_id = t.id
    AND i.reimbursement_note_id = v_note.id;

  -- Marca a nota como Paga
  UPDATE public.reimbursement_notes
  SET status = 'paid',
      paid_at = now(),
      updated_at = now()
  WHERE id = v_note.id
    AND status <> 'paid';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reimbursement_propagate_payment ON public.transactions;
CREATE TRIGGER trg_reimbursement_propagate_payment
AFTER INSERT OR UPDATE OF status, paid_amount, payment_date
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.reimbursement_propagate_payment();

-- 2) Trigger: se a TX-mãe for eliminada antes de paga,
--    a nota volta a 'approved' e payment_transaction_id é limpo.
CREATE OR REPLACE FUNCTION public.reimbursement_revert_on_tx_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.reimbursement_notes
  SET status = 'approved',
      payment_transaction_id = NULL,
      paid_at = NULL,
      updated_at = now()
  WHERE payment_transaction_id = OLD.id
    AND status = 'pending_payment';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_reimbursement_revert_on_tx_delete ON public.transactions;
CREATE TRIGGER trg_reimbursement_revert_on_tx_delete
BEFORE DELETE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.reimbursement_revert_on_tx_delete();
