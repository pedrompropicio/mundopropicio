-- Real installed trigger function definitions; local dependency schema is deliberately isolated.
CREATE OR REPLACE FUNCTION public.apply_transaction_offsets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_method = 'compensation' OR NEW.status <> 'paid' OR NEW.reversed_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
    FOR o IN SELECT id FROM public.transaction_offsets
              WHERE receivable_transaction_id = NEW.transaction_id
                 OR payable_transaction_id = NEW.transaction_id
    LOOP
      PERFORM public._apply_transaction_offset(o.id, NEW.id);
    END LOOP;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.payment_method <> 'compensation' AND OLD.status = 'paid' AND OLD.reversed_at IS NULL
       AND (NEW.status <> 'paid' OR NEW.reversed_at IS NOT NULL) THEN
      PERFORM public._reverse_transaction_offsets_for(NEW.transaction_id);
    END IF;
    RETURN NEW;
  ELSE
    IF OLD.payment_method <> 'compensation' AND OLD.status = 'paid' AND OLD.reversed_at IS NULL THEN
      PERFORM public._reverse_transaction_offsets_for(OLD.transaction_id);
    END IF;
    RETURN OLD;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.force_no_account_on_compensation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Compensacao e encontro de contas sem movimento de caixa: nunca pode ter
  -- conta, senao entra na formula do saldo (que soma por t.account_id) e
  -- inflaciona a conta com dinheiro que nunca la entrou.
  -- Precedente: 4 transacoes do Coala, 103.467,78 EUR, apontadas ao Santander;
  -- so nao corromperam o saldo porque sao anteriores a data de corte de 31/08.
  IF NEW.payment_method = 'compensation' AND NEW.account_id IS NOT NULL THEN
    NEW.account_id := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_tx_paid_requires_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'paid' AND NEW.account_id IS NULL THEN
    -- Isenções documentadas:
    --  * fluxos server-side (edge functions / importações) correm como service_role
    --  * transitórias (caução, irmã "extra do sócio"), fora do resultado e reembolsos
    --    nascem legitimamente sem conta da empresa
    --  * (g7) compensação: encontro de contas NUNCA tem conta por desenho
    --    (trigger force_no_account_on_compensation limpa account_id), e uma receita
    --    com "Recebido por" nasce paga (trg_enforce_held_revenue_is_paid)
    IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'supabase_storage_admin')
       OR COALESCE(NEW.is_transitory, false)
       OR COALESCE(NEW.exclude_from_result, false)
       OR COALESCE(NEW.is_reimbursement, false)
       OR COALESCE(NEW.payment_method, '') = 'compensation' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Transação paga exige conta financeira associada (account_id).';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  o record; op record; src record; oth record;
  v_other uuid; v_open numeric; v_amt numeric; v_new uuid;
BEGIN
  SELECT * INTO o FROM public.transaction_offsets WHERE id = p_offset_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO op FROM public.transaction_payments WHERE id = p_origin_payment_id;
  IF NOT FOUND OR op.payment_method = 'compensation' OR op.status <> 'paid' OR op.reversed_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF op.transaction_id = o.receivable_transaction_id THEN
    v_other := o.payable_transaction_id;
  ELSIF op.transaction_id = o.payable_transaction_id THEN
    v_other := o.receivable_transaction_id;
  ELSE
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM public.transaction_payments x
              WHERE x.offset_id = o.id AND x.transaction_id = v_other
                AND x.status = 'paid' AND x.reversed_at IS NULL) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO src FROM public.transactions WHERE id = op.transaction_id;
  SELECT * INTO oth FROM public.transactions WHERE id = v_other;
  SELECT round(oth.amount * (1 + COALESCE(oth.iva_rate, 0) / 100.0), 2)
         - COALESCE((SELECT SUM(x.amount) FROM public.transaction_payments x
                      WHERE x.transaction_id = v_other AND x.status IN ('planned','paid')), 0)
    INTO v_open;
  v_amt := round(LEAST(o.amount, v_open), 2);
  IF v_amt <= 0.01 THEN RETURN NULL; END IF;

  INSERT INTO public.transaction_payments (
    transaction_id, amount, payment_date, account_id, payment_method,
    payment_reference, notes, created_by, company_id, status, offset_id,
    closes_transaction, currency
  ) VALUES (
    v_other, v_amt, op.payment_date, NULL, 'compensation',
    left('Compensação com ' || COALESCE(src.description, src.id::text), 250),
    'Gerado pela ligação de compensação ' || o.id::text,
    op.created_by, oth.company_id, 'paid', o.id,
    (COALESCE(oth.currency, 'EUR') <> 'EUR' AND v_amt >= v_open - 0.05),
    'EUR'
  ) RETURNING id INTO v_new;

  -- Chamada a partir de um trigger: o sync_paid_amount_from_payments do INSERT
  -- acima corre com depth > 1 e sai sem derivar — deriva-se aqui com a MESMA
  -- função (contexto do dono do trigger). Chamada a partir da RPC (depth 0):
  -- o sync corre normalmente.
  IF pg_trigger_depth() > 0 THEN
    PERFORM public._derive_paid_amount(v_other);
  END IF;
  RETURN v_new;
END;
$function$;

CREATE OR REPLACE FUNCTION public._reverse_transaction_offsets_for(p_tx_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o record; v_other uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.transaction_payments x
              WHERE x.transaction_id = p_tx_id AND x.payment_method <> 'compensation'
                AND x.status = 'paid' AND x.reversed_at IS NULL) THEN
    RETURN;
  END IF;
  FOR o IN SELECT * FROM public.transaction_offsets
            WHERE receivable_transaction_id = p_tx_id OR payable_transaction_id = p_tx_id
  LOOP
    v_other := CASE WHEN o.receivable_transaction_id = p_tx_id
                    THEN o.payable_transaction_id ELSE o.receivable_transaction_id END;
    UPDATE public.transaction_payments
       SET status = 'reversed', reversed_at = now(), reversed_by = (SELECT auth.uid()),
           reversal_reason = 'estorno do pagamento de origem'
     WHERE offset_id = o.id AND transaction_id = v_other
       AND status = 'paid' AND reversed_at IS NULL;
    IF FOUND THEN
      PERFORM public._derive_paid_amount(v_other);
    END IF;
  END LOOP;
END;
$function$;


CREATE TRIGGER trg_apply_transaction_offsets AFTER INSERT OR UPDATE OF status,reversed_at OR DELETE ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION public.apply_transaction_offsets();
CREATE TRIGGER trg_sync_paid AFTER INSERT OR UPDATE OR DELETE ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION public.sync_paid_amount_from_payments();
CREATE TRIGGER trg_validate_total BEFORE INSERT OR UPDATE ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION public.validate_installments_total();
CREATE TRIGGER trg_no_account BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.force_no_account_on_compensation();
CREATE TRIGGER trg_paid_account BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_tx_paid_requires_account();
