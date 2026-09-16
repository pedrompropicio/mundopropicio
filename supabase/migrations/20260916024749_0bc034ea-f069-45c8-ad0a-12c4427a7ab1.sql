-- 1. financial_accounts: conta corrente de circuito de terceiros
ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS is_circuit_account boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.financial_accounts.is_circuit_account IS
  'Conta corrente de circuito de terceiros (D-ERP69). O saldo e a posicao liquida com o circuito: positivo = terceiros devem-nos; negativo = temos dinheiro deles por aplicar; zero no fim. E a unica porta entre o circuito e o resultado.';

-- 2. transactions: marcacao de adiantamento por conta de terceiros
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS shared_cost_account_id uuid REFERENCES public.financial_accounts(id),
  ADD COLUMN IF NOT EXISTS shared_cost_counterparty_id uuid REFERENCES public.suppliers(id);

COMMENT ON COLUMN public.transactions.shared_cost_account_id IS
  'Quando preenchida, esta linha nao e custo da MP: e adiantamento por conta de terceiros (D-ERP69), e a posicao vive nesta conta de circuito. Forca exclude_from_result = true e gera espelho income em 10.12.01 na conta de circuito.';

COMMENT ON COLUMN public.transactions.shared_cost_counterparty_id IS
  'Terceiro concreto do adiantamento por conta de terceiros (D-ERP69), quando se sabe. Opcional; serve para abrir a posicao da conta de circuito por contraparte.';

CREATE INDEX IF NOT EXISTS idx_transactions_shared_cost_account
  ON public.transactions (shared_cost_account_id)
  WHERE shared_cost_account_id IS NOT NULL;

-- 3. Rubricas 10.12 / 10.12.01 na Mundo Propicio
DO $$
DECLARE
  v_company uuid := '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
  v_g10 uuid;
  v_l2  uuid;
BEGIN
  SELECT id INTO v_g10 FROM public.account_categories
   WHERE company_id = v_company AND code = '10' LIMIT 1;
  IF v_g10 IS NULL THEN
    RAISE EXCEPTION 'Rubrica 10 nao existe na empresa %', v_company;
  END IF;

  SELECT id INTO v_l2 FROM public.account_categories
   WHERE company_id = v_company AND code = '10.12' LIMIT 1;
  IF v_l2 IS NULL THEN
    INSERT INTO public.account_categories (company_id, code, name, type, parent_id, event_required, allocate_to_active_event)
    VALUES (v_company, '10.12', 'Rateio com Terceiros', 'income', v_g10, false, false)
    RETURNING id INTO v_l2;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.account_categories
                  WHERE company_id = v_company AND code = '10.12.01') THEN
    INSERT INTO public.account_categories (company_id, code, name, type, parent_id, event_required, allocate_to_active_event)
    VALUES (v_company, '10.12.01', 'Adiantamento por Conta de Terceiros', 'income', v_l2, false, false);
  END IF;
END $$;

-- 4. Ponte 1:1 shared_cost_mirror (molde de partner_aporte_mirror)
CREATE TABLE IF NOT EXISTS public.shared_cost_mirror (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.financial_accounts(id),
  source_transaction_id uuid NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
  mirror_transaction_id uuid NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.shared_cost_mirror TO authenticated;
GRANT ALL ON public.shared_cost_mirror TO service_role;

ALTER TABLE public.shared_cost_mirror ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scm_select_privileged ON public.shared_cost_mirror;
CREATE POLICY scm_select_privileged ON public.shared_cost_mirror
  FOR SELECT
  USING (
    has_role((SELECT auth.uid()), 'admin'::app_role)
    OR has_role((SELECT auth.uid()), 'platform_admin'::app_role)
    OR has_role((SELECT auth.uid()), 'manager'::app_role)
    OR has_role((SELECT auth.uid()), 'accountant'::app_role)
    OR has_role((SELECT auth.uid()), 'editor'::app_role)
    OR has_role((SELECT auth.uid()), 'viewer'::app_role)
  );

DROP POLICY IF EXISTS company_isolation_shared_cost_mirror ON public.shared_cost_mirror;
CREATE POLICY company_isolation_shared_cost_mirror ON public.shared_cost_mirror
  AS RESTRICTIVE
  FOR ALL
  USING (company_id = current_company_id());

-- 5. exclude_from_result forcado quando ha conta de circuito
CREATE OR REPLACE FUNCTION public.force_exclude_from_result_for_shared_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- A parte de terceiros nunca e custo da MP (D-ERP69). Nao depende de toggle na UI.
  IF NEW.shared_cost_account_id IS NOT NULL THEN
    NEW.exclude_from_result := true;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_force_exclude_result_shared_cost ON public.transactions;
CREATE TRIGGER trg_force_exclude_result_shared_cost
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.force_exclude_from_result_for_shared_cost();

-- 6. Espelho na conta de circuito
CREATE OR REPLACE FUNCTION public.sync_shared_cost_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_src        record;
  v_ret        record;
  v_bridge_id  uuid;
  v_mirror_id  uuid;
  v_amount     numeric := 0;
  v_cat_id     uuid;
begin
  if TG_OP = 'DELETE' then v_src := OLD; v_ret := OLD; else v_src := NEW; v_ret := NEW; end if;

  -- Guarda anti-recursao: o proprio espelho nunca dispara logica de espelho.
  if exists (select 1 from shared_cost_mirror where mirror_transaction_id = v_src.id) then
    return v_ret;
  end if;

  select id, mirror_transaction_id into v_bridge_id, v_mirror_id
    from shared_cost_mirror
   where source_transaction_id = v_src.id;

  if TG_OP <> 'DELETE'
     and NEW.type = 'expense'
     and NEW.shared_cost_account_id is not null
     and NEW.status = 'paid'
     and NEW.reversed_at is null
  then
    v_amount := coalesce(NEW.paid_amount, 0);
  end if;

  -- Nada a fazer
  if v_amount <= 0 and v_bridge_id is null then
    return v_ret;
  end if;

  -- Deixou de haver adiantamento: apagar o espelho (a ponte cai por cascata)
  if v_amount <= 0 then
    delete from transactions where id = v_mirror_id;
    return v_ret;
  end if;

  select id into v_cat_id from account_categories
   where company_id = NEW.company_id and code = '10.12.01' limit 1;
  if v_cat_id is null then
    raise exception 'Custo partilhado: rubrica 10.12.01 nao existe na empresa %', NEW.company_id;
  end if;

  if v_bridge_id is null then
    insert into transactions (
      company_id, type, description, amount, paid_amount, iva_rate,
      date, payment_date, status, account_id, event_id, supplier_id,
      category_id, payment_method, exclude_from_result
    ) values (
      NEW.company_id, 'income',
      'Adiantamento por conta de terceiros — ' || coalesce(NEW.description, ''),
      v_amount, v_amount, 0,
      NEW.date, NEW.payment_date, 'paid',
      NEW.shared_cost_account_id, null, NEW.shared_cost_counterparty_id,
      v_cat_id, 'transfer', true
    ) returning id into v_mirror_id;

    insert into shared_cost_mirror
      (company_id, account_id, source_transaction_id, mirror_transaction_id)
    values (NEW.company_id, NEW.shared_cost_account_id, NEW.id, v_mirror_id);
  else
    update transactions set
      description  = 'Adiantamento por conta de terceiros — ' || coalesce(NEW.description, ''),
      amount       = v_amount,
      paid_amount  = v_amount,
      date         = NEW.date,
      payment_date = NEW.payment_date,
      account_id   = NEW.shared_cost_account_id,
      supplier_id  = NEW.shared_cost_counterparty_id,
      updated_at   = now()
    where id = v_mirror_id;

    update shared_cost_mirror
       set account_id = NEW.shared_cost_account_id, updated_at = now()
     where id = v_bridge_id;
  end if;

  return v_ret;
end;
$function$;

DROP TRIGGER IF EXISTS trg_sync_shared_cost_mirror ON public.transactions;
CREATE TRIGGER trg_sync_shared_cost_mirror
  AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_shared_cost_mirror();

DROP TRIGGER IF EXISTS trg_sync_shared_cost_mirror_del ON public.transactions;
CREATE TRIGGER trg_sync_shared_cost_mirror_del
  BEFORE DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_shared_cost_mirror();

-- 7. Hardening SECDEF
REVOKE EXECUTE ON FUNCTION public.force_exclude_from_result_for_shared_cost() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.force_exclude_from_result_for_shared_cost() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.force_exclude_from_result_for_shared_cost() TO service_role;

REVOKE EXECUTE ON FUNCTION public.sync_shared_cost_mirror() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_shared_cost_mirror() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sync_shared_cost_mirror() TO service_role;