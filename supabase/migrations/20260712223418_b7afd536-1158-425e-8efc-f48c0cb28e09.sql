
-- Trigger: quando a OUT tx de uma carga fica paga, cria a IN tx no cartão.
CREATE OR REPLACE FUNCTION public.card_load_on_out_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_load  public.card_session_loads%ROWTYPE;
  v_sess  public.card_sessions%ROWTYPE;
  v_src_name TEXT;
  v_card_name TEXT;
  v_cat_id UUID;
  v_in_id UUID;
BEGIN
  IF NEW.status <> 'paid' OR OLD.status = 'paid' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_load
  FROM public.card_session_loads
  WHERE out_transaction_id = NEW.id
    AND in_transaction_id IS NULL
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_sess FROM public.card_sessions WHERE id = v_load.session_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT name INTO v_src_name  FROM public.financial_accounts WHERE id = v_load.source_account_id;
  SELECT name INTO v_card_name FROM public.financial_accounts WHERE id = v_sess.card_account_id;
  SELECT id   INTO v_cat_id    FROM public.account_categories  WHERE code = '10.3' LIMIT 1;

  INSERT INTO public.transactions (
    company_id, type, description, amount, iva_rate, date,
    status, paid_amount, payment_date,
    is_transitory, exclude_from_result, category_id, account_id
  ) VALUES (
    NEW.company_id, 'income',
    'Carga de ' || COALESCE(v_src_name,'origem') || ' (' || COALESCE(v_src_name,'origem') || ' → ' || COALESCE(v_card_name,'cartão') || ')',
    v_load.amount, 0, v_load.load_date,
    'paid', v_load.amount, COALESCE(NEW.payment_date, v_load.load_date),
    TRUE, TRUE, v_cat_id, v_sess.card_account_id
  ) RETURNING id INTO v_in_id;

  UPDATE public.card_session_loads
     SET in_transaction_id = v_in_id
   WHERE id = v_load.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_card_load_on_out_paid ON public.transactions;
CREATE TRIGGER trg_card_load_on_out_paid
AFTER UPDATE OF status ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.card_load_on_out_paid();

-- Trigger: eliminar a OUT tx cancela tudo (apaga IN se existir + linha em loads).
CREATE OR REPLACE FUNCTION public.card_load_on_out_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_in_id UUID;
BEGIN
  SELECT in_transaction_id INTO v_in_id
  FROM public.card_session_loads
  WHERE out_transaction_id = OLD.id;
  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  DELETE FROM public.card_session_loads WHERE out_transaction_id = OLD.id;
  IF v_in_id IS NOT NULL THEN
    DELETE FROM public.transactions WHERE id = v_in_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_card_load_on_out_delete ON public.transactions;
CREATE TRIGGER trg_card_load_on_out_delete
BEFORE DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.card_load_on_out_delete();
