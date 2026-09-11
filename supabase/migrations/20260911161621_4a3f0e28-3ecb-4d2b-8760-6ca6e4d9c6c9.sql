-- D-ERP37 (fecho) — as duas últimas funções SECURITY DEFINER abertas a anon que
-- não verificavam nada por dentro. Molde da D-ERP38: portão no corpo, isenção
-- explícita para auth.uid() IS NULL (service_role, crons, edge functions).

-- 1.1 event_budget_mode — FALHA ALTO (excepção).
-- É chamada de dentro do trigger enforce_transaction_approval_permission, que
-- compara o resultado com = 'with_bp'. Devolver NULL fora da empresa faria essa
-- comparação dar falso em silêncio e desligaria a trava de linha de BP. Por isso
-- levanta 42501 em vez de devolver NULL ou um valor por omissão.
CREATE OR REPLACE FUNCTION public.event_budget_mode(_event_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_mode text;
BEGIN
  SELECT e.company_id, COALESCE(e.budget_mode, c.default_budget_mode, 'with_bp')
    INTO v_company, v_mode
  FROM public.events e
  JOIN public.companies c ON c.id = e.company_id
  WHERE e.id = _event_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Isenção deliberada: sem identidade de utilizador (service_role, crons,
  -- edge functions, syncs) passa sem verificar. Não "corrigir" isto.
  IF v_uid IS NOT NULL
     AND NOT public.is_platform_admin(v_uid)
     AND v_company IS DISTINCT FROM public.current_company_id() THEN
    RAISE EXCEPTION 'Evento de outra empresa.' USING ERRCODE = '42501';
  END IF;

  RETURN v_mode;
END;
$function$;

-- 1.2 account_has_balance_for — FALHA FECHADO (false).
-- Devolve só booleano por desenho (D-ERP34), mas perguntar repetidamente com
-- valores diferentes sobre uma conta de outra empresa revelava o saldo ao
-- cêntimo por bissecção. Fora da empresa devolve false: bloqueia o pagamento e
-- não parte nada.
CREATE OR REPLACE FUNCTION public.account_has_balance_for(_account_id uuid, _amount numeric)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_skip boolean;
  v_company uuid;
  v_balance numeric;
BEGIN
  SELECT skip_balance_check, company_id INTO v_skip, v_company
  FROM public.financial_accounts WHERE id = _account_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Isenção deliberada: auth.uid() IS NULL = service_role/crons/edge functions.
  IF v_uid IS NOT NULL
     AND NOT public.is_platform_admin(v_uid)
     AND v_company IS DISTINCT FROM public.current_company_id() THEN
    RETURN false;
  END IF;

  IF COALESCE(v_skip, false) THEN
    RETURN true;
  END IF;

  v_balance := public._account_true_balance_raw(_account_id);
  RETURN COALESCE(_amount, 0) <= COALESCE(v_balance, 0);
END;
$function$;