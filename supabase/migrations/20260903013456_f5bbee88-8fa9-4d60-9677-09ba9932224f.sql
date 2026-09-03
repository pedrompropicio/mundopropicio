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
  -- ===== PERMISSÃO (approve_transactions) =====
  -- Só na transição para 'approved'. PAGAR é outro acto, com regras próprias:
  -- não se exige aqui a permissão de aprovar.
  IF TG_OP = 'INSERT' THEN
    v_check_permission := (NEW.status = 'approved');
  ELSIF TG_OP = 'UPDATE' THEN
    v_check_permission := (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved');
  END IF;

  -- ===== LINHA DE BP (D1 + D8) =====
  -- Corre no INSERT que nasce 'approved' OU 'paid' (cartões pré-pagos, camarim,
  -- cachês: transações que nunca passam por 'pending'), e no UPDATE que transita
  -- para 'approved'.
  --
  -- NÃO corre no UPDATE que transita para 'paid'. É DELIBERADO: existem 462
  -- transações antigas já aprovadas sem linha de BP em eventos geridos com BP;
  -- bloquear o pagamento delas seria mexer para trás no meio do fecho. Quem já
  -- está aprovado paga-se. Não "corrijas" isto sem uma decisão explícita e sem
  -- primeiro sanar o histórico.
  IF TG_OP = 'INSERT' THEN
    v_check_bp_line := (NEW.status IN ('approved', 'paid'));
  ELSIF TG_OP = 'UPDATE' THEN
    v_check_bp_line := (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved');
  END IF;

  -- service_role / crons / edge functions / syncs: sem identidade de utilizador → permitido
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_check_permission THEN
    IF NOT (
      public.is_platform_admin()
      OR public.has_permission_in(v_uid, 'approve_transactions', NEW.company_id)
    ) THEN
      RAISE EXCEPTION 'Sem permissão para aprovar transações nesta empresa.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_check_bp_line THEN
    -- Isenção: filha de rateio ou parcela — a obrigação é do pai (o master de
    -- rateio não tem event_id, logo nunca seria abrangido).
    IF NEW.type = 'expense'
       AND NEW.event_id IS NOT NULL
       AND NEW.forecast_id IS NULL
       AND NEW.parent_transaction_id IS NULL
       AND public.event_budget_mode(NEW.event_id) = 'with_bp'
    THEN
      RAISE EXCEPTION 'Esta transação não tem linha de BP. Escolhe a linha (ou cria uma) antes de aprovar ou pagar.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;