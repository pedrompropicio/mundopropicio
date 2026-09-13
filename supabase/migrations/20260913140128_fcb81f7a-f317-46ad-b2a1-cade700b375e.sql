-- (g9c) A1: presença nominal não dá visibilidade
CREATE OR REPLACE FUNCTION public.user_settlement_ids(_user uuid)
 RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT DISTINCT p.settlement_id
    FROM public.event_settlement_participants p
   WHERE p.supplier_id IS NOT NULL
     AND p.mode = 'settles'
     AND p.supplier_id = public.user_supplier_id(_user);
$function$;

-- (g9c) A2: casa explícita OU implícita → MUNDO PROPÍCIO
CREATE OR REPLACE FUNCTION public.get_partner_event_shares(p_event_id uuid, p_settlement_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(partner_name text, percentage numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_sup uuid;
  v_node uuid := p_settlement_id;
  v_own numeric;
  v_house numeric;
  v_others numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_event_access(auth.uid(), p_event_id) THEN
    RETURN;
  END IF;

  IF public.has_staff_role(auth.uid()) THEN
    RETURN QUERY
      SELECT COALESCE(s.name, CASE WHEN p.participant_kind = 'house' THEN 'MUNDO PROPÍCIO' ELSE 'Sócio' END)::text,
             SUM(p.profit_pct)::numeric
      FROM public.event_settlement_participants p
      LEFT JOIN public.suppliers s ON s.id = p.supplier_id
      WHERE p.event_id = p_event_id
        AND p.mode = 'settles'
        AND (v_node IS NULL OR p.settlement_id = v_node)
      GROUP BY 1
      ORDER BY 2 DESC NULLS LAST, 1;
    RETURN;
  END IF;

  v_sup := public.user_supplier_id(auth.uid());
  IF v_sup IS NULL THEN RETURN; END IF;

  IF v_node IS NULL THEN
    SELECT settlement_id INTO v_node
      FROM public.get_partner_visible_settlements(p_event_id) LIMIT 1;
  END IF;
  IF v_node IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(p.profit_pct), 0) INTO v_own
  FROM public.event_settlement_participants p
  WHERE p.settlement_id = v_node AND p.event_id = p_event_id
    AND p.mode = 'settles' AND p.supplier_id = v_sup;

  IF v_own = 0 THEN RETURN; END IF;

  RETURN QUERY
    SELECT COALESCE(s.name, 'Sócio')::text, v_own
    FROM public.suppliers s WHERE s.id = v_sup;

  IF v_own >= 100 THEN RETURN; END IF;

  SELECT COALESCE(SUM(CASE WHEN p.participant_kind = 'house' THEN p.profit_pct ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN p.participant_kind <> 'house' THEN p.profit_pct ELSE 0 END), 0)
    INTO v_house, v_others
  FROM public.event_settlement_participants p
  WHERE p.settlement_id = v_node AND p.event_id = p_event_id
    AND p.mode = 'settles' AND COALESCE(p.supplier_id, '00000000-0000-0000-0000-000000000000') <> v_sup;

  IF v_others = 0 THEN
    RETURN QUERY SELECT 'MUNDO PROPÍCIO'::text, (100 - v_own)::numeric;
  ELSE
    RETURN QUERY SELECT 'Sócios locais'::text, (100 - v_own)::numeric;
  END IF;
END;
$function$;

-- ============================ PROVA (mesma transacção) ============================
DO $prova$
DECLARE
  c_lobo_uid uuid := '699c117d-a376-4760-8869-852faa87cb6b';
  c_staff_uid uuid := 'd8e502f7-9ceb-4dae-bd73-7291832d0d6f';
  c_lobo_sup uuid := '1d62b176-ba78-4fcb-9dc1-c467691797a9';
  c_event uuid := 'fdfb39fe-45f2-43f5-9ec9-7cb536360ae1';
  c_node uuid := '55a48a9f-79ec-4a15-aa99-75cfa6e5815d';
  v_n int;
  v_only uuid;
  v_tpo int;
  v_shares text;
  v_staff_rows int;
  v_fail text := '';
BEGIN
  BEGIN
    -- simulação: ligar o utilizador do lobo ao fornecedor RAFAEL LOBO
    UPDATE public.profiles SET linked_supplier_id = c_lobo_sup WHERE id = c_lobo_uid;

    -- A1: quantos fechamentos e qual
    SELECT count(*), min(x::text)::uuid INTO v_n, v_only FROM public.user_settlement_ids(c_lobo_uid) x;
    IF v_n <> 1 OR v_only <> c_node THEN
      v_fail := v_fail || format('A1: esperado 1 fechamento (%s), obtido %s (%s). ', c_node, v_n, v_only);
    END IF;

    -- A1b: operações de terceiros atribuídas ao sócio neste evento
    SELECT count(*) INTO v_tpo
      FROM public.event_third_party_operations o
     WHERE o.event_id = c_event
       AND o.held_by_supplier_id = c_lobo_sup;
    IF v_tpo <> 0 THEN
      v_fail := v_fail || format('A1b: esperado 0 operações de terceiros, obtido %s. ', v_tpo);
    END IF;

    -- A2: quotas vistas pelo sócio
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_lobo_uid, 'role', 'authenticated')::text, true);
    SELECT string_agg(partner_name || ' ' || percentage::text, ' | ' ORDER BY percentage DESC)
      INTO v_shares
      FROM public.get_partner_event_shares(c_event, c_node);
    IF COALESCE(v_shares, '') <> 'MUNDO PROPÍCIO 80 | RAFAEL LOBO 20' THEN
      v_fail := v_fail || format('A2: esperado "MUNDO PROPÍCIO 80 | RAFAEL LOBO 20", obtido "%s". ', v_shares);
    END IF;

    -- A3: comportamento inalterado para quem não tem acesso ao evento pelo Portal
    -- (pedroneto é staff mas não tem partner_event_access → 0 linhas, como antes)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_staff_uid, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_staff_rows
      FROM public.get_partner_event_shares(c_event, 'b415da54-9e6f-4556-a855-c774c2785305'::uuid);
    IF v_staff_rows <> 0 THEN
      v_fail := v_fail || format('A3: esperado 0 linhas (sem partner_event_access), obtido %s. ', v_staff_rows);
    END IF;

    PERFORM set_config('request.jwt.claims', '', true);

    -- reverter SEMPRE a simulação (subtransacção)
    RAISE EXCEPTION 'PROVA_G9C_ROLLBACK';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'PROVA_G9C_ROLLBACK' THEN RAISE; END IF;
  END;

  IF v_fail <> '' THEN
    RAISE EXCEPTION 'PROVA g9c FALHOU: %', v_fail;
  END IF;

  RAISE NOTICE 'PROVA g9c OK — A1 fechamentos=1 (Fechamento Rafael Lobo), A1b operacoes_terceiros=0, A2 quotas="%", A3 staff_linhas=% ; simulacao revertida', v_shares, v_staff_rows;
END
$prova$;