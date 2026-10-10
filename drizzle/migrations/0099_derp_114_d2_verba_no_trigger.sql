CREATE OR REPLACE FUNCTION public.enforce_transaction_approval_permission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_check_permission boolean := false;
  v_check_bp_line boolean := false;
  v_verba numeric;
  v_desc text;
  v_rubrica text;
  v_real numeric;
BEGIN
  -- ===== PERMISSAO (approve_transactions) =====
  -- So no UPDATE que transita para 'approved'.
  -- NAO se exige no INSERT: quem nasce aprovado nasce pela regra do saldo do BP
  -- (a aprovacao previa e a verba, decidida em TransactionFormModal), e o gate
  -- da linha abaixo garante que existe linha de BP por tras. Aprovar FORA da
  -- verba e que e acto humano, e esse caminho passa sempre por UPDATE.
  -- Alterado 03/09/2026 apos a migracao D13 ter bloqueado todo o lancamento.
  IF TG_OP = 'UPDATE' THEN
    v_check_permission := (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved');
  END IF;

  -- ===== LINHA DE BP (D1 + D8) =====
  -- Corre no INSERT que nasce 'approved' OU 'paid' (cartoes pre-pagos, camarim,
  -- caches: transacoes que nunca passam por 'pending'), e no UPDATE que transita
  -- para 'approved'.
  --
  -- NAO corre no UPDATE que transita para 'paid'. E DELIBERADO: existem 462
  -- transacoes antigas ja aprovadas sem linha de BP em eventos geridos com BP;
  -- bloquear o pagamento delas seria mexer para tras no meio do fecho. Quem ja
  -- esta aprovado paga-se. Nao "corrijas" isto sem uma decisao explicita e sem
  -- primeiro sanar o historico.
  IF TG_OP = 'INSERT' THEN
    v_check_bp_line := (NEW.status IN ('approved', 'paid'));
  ELSIF TG_OP = 'UPDATE' THEN
    v_check_bp_line := (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved');
  END IF;

  -- service_role / crons / edge functions / syncs: sem identidade de utilizador -> permitido
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_check_permission THEN
    IF NOT (
      public.is_platform_admin()
      OR public.has_permission_in(v_uid, 'approve_transactions', NEW.company_id)
    ) THEN
      RAISE EXCEPTION 'Sem permissao para aprovar transacoes nesta empresa.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_check_bp_line THEN
    -- Isencoes da linha: ver historico (09/09 predicado countsAsBudgetCommitment,
    -- 16/09 D-ERP69 custo partilhado, 20/09 #111 rubrica 10.3).
    IF NEW.type = 'expense'
       AND NEW.event_id IS NOT NULL
       AND NEW.forecast_id IS NULL
       AND NEW.parent_transaction_id IS NULL
       AND COALESCE(NEW.is_transitory, false) = false
       AND COALESCE(NEW.exclude_from_result, false) = false
       AND NEW.reversed_at IS NULL
       AND COALESCE(NEW.is_hidden, false) = false
       AND NEW.shared_cost_account_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.account_categories c
          WHERE c.id = NEW.category_id
            AND c.code LIKE '10.3%'
       )
       AND public.event_budget_mode(NEW.event_id) = 'with_bp'
    THEN
      RAISE EXCEPTION 'Esta transacao nao tem linha de BP. Escolhe a linha (ou cria uma) antes de aprovar ou pagar.'
        USING ERRCODE = '42501';
    END IF;

    -- ===== VERBA DA LINHA (D2, #114, 10/10/2026) =====
    -- Aprovar/inserir aprovada ou paga uma despesa que leve o realizado da linha
    -- acima de event_forecasts.amount e recusado. Elevar no mesmo acto =
    -- raise_forecast_budget antes (sobe amount), por isso aqui basta comparar.
    -- Base liquida (D11). Realizado exclui transitorias, excluidas do resultado,
    -- revertidas e escondidas. Filhas de rateio/parcelas isentas (obrigacao do pai).
    -- UPDATE -> paid continua fora (D13, #111). baseline_amount nao e lido nem tocado.
    IF NEW.type = 'expense'
       AND NEW.forecast_id IS NOT NULL
       AND NEW.parent_transaction_id IS NULL
       AND COALESCE(NEW.is_transitory, false) = false
       AND COALESCE(NEW.exclude_from_result, false) = false
       AND NEW.reversed_at IS NULL
       AND COALESCE(NEW.is_hidden, false) = false
    THEN
      SELECT f.amount, f.description, COALESCE(c.code || ' ' || c.name, '')
        INTO v_verba, v_desc, v_rubrica
        FROM public.event_forecasts f
        LEFT JOIN public.account_categories c ON c.id = f.category_id
       WHERE f.id = NEW.forecast_id
       FOR UPDATE OF f;

      IF FOUND THEN
        SELECT COALESCE(sum(t.amount), 0) INTO v_real
          FROM public.transactions t
         WHERE t.forecast_id = NEW.forecast_id
           AND t.id <> NEW.id
           AND t.type = 'expense'
           AND t.status IN ('approved', 'paid')
           AND COALESCE(t.is_transitory, false) = false
           AND COALESCE(t.exclude_from_result, false) = false
           AND t.reversed_at IS NULL
           AND COALESCE(t.is_hidden, false) = false;
        v_real := v_real + COALESCE(NEW.amount, 0);
        IF v_real > COALESCE(v_verba, 0) + 0.005 THEN
          RAISE EXCEPTION 'Verba excedida na rubrica % ("%"): verba % €, realizado com esta despesa % €, excesso % €. Eleve a verba da linha no mesmo acto antes de aprovar.',
            v_rubrica, v_desc,
            to_char(COALESCE(v_verba,0), 'FM999G999G990D00'),
            to_char(v_real, 'FM999G999G990D00'),
            to_char(v_real - COALESCE(v_verba,0), 'FM999G999G990D00')
            USING ERRCODE = 'P0409';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;