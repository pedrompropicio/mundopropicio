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
    -- Isencao: filha de rateio ou parcela — a obrigacao e do pai (o master de
    -- rateio nao tem event_id, logo nunca seria abrangido).
    --
    -- Isencao (09/09/2026): a trava aplica-se exactamente as transacoes que
    -- CONSOMEM verba do BP. E o mesmo predicado que o frontend ja usa em
    -- countsAsBudgetCommitment (TransactionFormModal.tsx ~801): transitorias,
    -- excluidas do resultado, revertidas e escondidas nao consomem linha, logo
    -- nao podem ser obrigadas a ter linha. Caso canonico: Extra do Socio
    -- (partner_advance_expenses) — custo do socio, nunca do evento.
    IF NEW.type = 'expense'
       AND NEW.event_id IS NOT NULL
       AND NEW.forecast_id IS NULL
       AND NEW.parent_transaction_id IS NULL
       AND COALESCE(NEW.is_transitory, false) = false
       AND COALESCE(NEW.exclude_from_result, false) = false
       AND NEW.reversed_at IS NULL
       AND COALESCE(NEW.is_hidden, false) = false
       AND public.event_budget_mode(NEW.event_id) = 'with_bp'
    THEN
      RAISE EXCEPTION 'Esta transacao nao tem linha de BP. Escolhe a linha (ou cria uma) antes de aprovar ou pagar.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;