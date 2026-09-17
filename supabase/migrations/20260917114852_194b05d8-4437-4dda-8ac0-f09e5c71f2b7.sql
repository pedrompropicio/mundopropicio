ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS transitory_reason text;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_transitory_reason_domain;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_transitory_reason_domain
  CHECK (transitory_reason IS NULL OR transitory_reason IN (
    'partner_advance','repasse','caucao','emprestimo_socio',
    'carga_cartao','aporte_socio','entrada_a_repassar'
  ));

COMMENT ON COLUMN public.transactions.transitory_reason IS
  'Porque é que a transação é transitória (D-ERP80). Domínio fechado de 7 motivos; NULL só quando is_transitory = false.';

-- Ramo Capital: mantém o comportamento e passa a gravar o motivo.
-- Passa também a normalizar o motivo quando is_transitory deixa de ser verdade.
CREATE OR REPLACE FUNCTION public.force_transitory_for_capital_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  IF NEW.category_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id)
  THEN
    SELECT code INTO v_code
    FROM public.account_categories
    WHERE id = NEW.category_id;

    -- Ramo Capital (10.1.*) → movimento de capital: entra na tesouraria, fora do resultado.
    -- Nunca força para false noutras rubricas.
    IF v_code IS NOT NULL AND v_code LIKE '10.1.%' THEN
      NEW.is_transitory := true;
      IF NEW.transitory_reason IS NULL THEN
        NEW.transitory_reason := CASE
          WHEN v_code = '10.1.04' THEN 'emprestimo_socio'
          ELSE 'aporte_socio'
        END;
      END IF;
    END IF;
  END IF;

  -- Deixou de ser transitória: o motivo cai com ela.
  IF coalesce(NEW.is_transitory, false) = false THEN
    NEW.transitory_reason := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Mesmo trigger, agora também disparado quando is_transitory muda (para limpar o motivo).
DROP TRIGGER IF EXISTS trg_force_transitory_capital ON public.transactions;
CREATE TRIGGER trg_force_transitory_capital
  BEFORE INSERT OR UPDATE OF category_id, is_transitory ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.force_transitory_for_capital_branch();

-- Perna de entrada da carga de cartão: grava o motivo.
CREATE OR REPLACE FUNCTION public.card_load_on_out_paid()
RETURNS trigger
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
    is_transitory, transitory_reason, exclude_from_result, category_id, account_id
  ) VALUES (
    NEW.company_id, 'income',
    'Carga de ' || COALESCE(v_src_name,'origem') || ' (' || COALESCE(v_src_name,'origem') || ' → ' || COALESCE(v_card_name,'cartão') || ')',
    v_load.amount, 0, v_load.load_date,
    'paid', v_load.amount, COALESCE(NEW.payment_date, v_load.load_date),
    TRUE, 'carga_cartao', TRUE, v_cat_id, v_sess.card_account_id
  ) RETURNING id INTO v_in_id;

  UPDATE public.card_session_loads
     SET in_transaction_id = v_in_id
   WHERE id = v_load.id;

  RETURN NEW;
END;
$$;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_transitory_reason_required;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_transitory_reason_required
  CHECK (NOT is_transitory OR transitory_reason IS NOT NULL) NOT VALID;