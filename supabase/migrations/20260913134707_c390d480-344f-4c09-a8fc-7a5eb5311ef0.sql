-- g9b — Identidade do sócio e RPCs estanques (#159 #160 #161 #163 #164 #165)
CREATE OR REPLACE FUNCTION public.user_supplier_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT p.linked_supplier_id FROM public.profiles p WHERE p.id = p_user_id),
    (SELECT s.id
       FROM public.profiles p
       JOIN public.suppliers s ON lower(s.email) = lower(p.email)
      WHERE p.id = p_user_id AND p.email IS NOT NULL AND s.email IS NOT NULL
      LIMIT 1)
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_event_partner_ids(_user uuid, _event_ids uuid[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT ep.id
    FROM public.event_partners ep
   WHERE ep.event_id = ANY (_event_ids)
     AND ep.supplier_id IS NOT NULL
     AND ep.supplier_id = public.user_supplier_id(_user);
$function$;

CREATE OR REPLACE FUNCTION public.is_settlement_staff(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.has_staff_role(_user);
$function$;

CREATE OR REPLACE FUNCTION public.user_settlement_visible_ids(_user uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE own AS (
    SELECT s.id
      FROM public.event_settlements s
     WHERE s.id IN (SELECT public.user_settlement_ids(_user))
    UNION
    SELECT s.id
      FROM public.event_settlements s
      JOIN own o ON s.parent_id = o.id
  )
  SELECT DISTINCT id FROM own;
$function$;

-- NOVO: fechamento visível = onde o sócio SETTLES (nunca presença nominal)
CREATE OR REPLACE FUNCTION public.get_partner_visible_settlements(_event_id uuid)
RETURNS TABLE(settlement_id uuid, settlement_position integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT sp.settlement_id, COALESCE(s.position, 0)::integer
    FROM public.event_settlement_participants sp
    JOIN public.event_settlements s ON s.id = sp.settlement_id
   WHERE sp.event_id = _event_id
     AND sp.mode = 'settles'
     AND sp.supplier_id IS NOT NULL
     AND sp.supplier_id = public.user_supplier_id(auth.uid())
     AND public.user_has_event_access(auth.uid(), _event_id)
   GROUP BY sp.settlement_id, s.position
   ORDER BY 2, 1;
$function$;
REVOKE ALL ON FUNCTION public.get_partner_visible_settlements(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_visible_settlements(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_partner_event_partner_expenses(p_event_ids uuid[])
RETURNS TABLE(kind text, id uuid, event_id uuid, notes text, entry_date date, description text, base_amount numeric, iva_rate numeric, total_amount numeric, created_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_sup uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  v_sup := public.user_supplier_id(v_uid);
  IF v_sup IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH req AS (
    SELECT e.id, e.parent_event_id FROM public.events e WHERE e.id = ANY(p_event_ids)
  ),
  allowed AS (
    SELECT r.id FROM req r
    WHERE EXISTS (
      SELECT 1 FROM public.partner_event_access pea
      WHERE pea.user_id = v_uid
        AND pea.is_active = true
        AND (pea.event_id = r.id
             OR (r.parent_event_id IS NOT NULL AND pea.event_id = r.parent_event_id))
    )
  ),
  mine AS (
    SELECT ep.id FROM public.event_partners ep
     JOIN allowed a ON a.id = ep.event_id
    WHERE ep.supplier_id = v_sup
  )
  SELECT 'advance'::text, pae.id, pae.event_id, pae.notes,
         t.date::date, t.description, t.amount::numeric,
         COALESCE(t.iva_rate, 0)::numeric,
         ROUND(t.amount + t.amount * COALESCE(t.iva_rate, 0) / 100.0, 2),
         pae.created_at
  FROM public.partner_advance_expenses pae
  JOIN allowed a ON a.id = pae.event_id
  JOIN mine m ON m.id = pae.partner_id
  LEFT JOIN public.transactions t ON t.id = pae.transaction_id
  UNION ALL
  SELECT 'paid'::text, ppe.id, ppe.event_id, ppe.notes,
         COALESCE(ppe.paid_date, t.date)::date, t.description, t.amount::numeric,
         COALESCE(t.iva_rate, 0)::numeric,
         ROUND(t.amount + t.amount * COALESCE(t.iva_rate, 0) / 100.0, 2),
         ppe.created_at
  FROM public.partner_paid_expenses ppe
  JOIN allowed a ON a.id = ppe.event_id
  JOIN mine m ON m.id = ppe.partner_id
  LEFT JOIN public.transactions t ON t.id = ppe.transaction_id;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_partner_event_shares(uuid);

CREATE OR REPLACE FUNCTION public.get_partner_event_shares(p_event_id uuid, p_settlement_id uuid DEFAULT NULL)
RETURNS TABLE(partner_name text, percentage numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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

  IF v_others = 0 AND v_house > 0 THEN
    RETURN QUERY SELECT 'MUNDO PROPÍCIO'::text, (100 - v_own)::numeric;
  ELSE
    RETURN QUERY SELECT 'Sócios locais'::text, (100 - v_own)::numeric;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_partner_event_shares(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_event_shares(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_partner_event_tx_aggregates(p_event_ids uuid[])
RETURNS TABLE(event_id uuid, tx_type text, category_id uuid, iva_rate numeric, base_amount numeric, iva_amount numeric, gross_amount numeric, tx_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_staff boolean;
  v_sup uuid;
  v_conf boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(v_uid, 'view_partner_transactions') THEN
    RETURN;
  END IF;

  v_staff := public.has_staff_role(v_uid);
  v_sup := public.user_supplier_id(v_uid);
  v_conf := public.can_see_confidential(v_uid);

  IF NOT v_staff THEN
    IF v_sup IS NULL THEN RETURN; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.event_settlement_participants sp
       WHERE sp.event_id = ANY (p_event_ids)
         AND sp.mode = 'settles'
         AND sp.supplier_id = v_sup
    ) THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH req AS (
    SELECT e.id, e.parent_event_id FROM public.events e WHERE e.id = ANY(p_event_ids)
  ),
  allowed AS (
    SELECT r.id FROM req r
    WHERE EXISTS (
      SELECT 1 FROM public.partner_event_access pea
      WHERE pea.user_id = v_uid
        AND pea.is_active = true
        AND (pea.event_id = r.id
             OR (r.parent_event_id IS NOT NULL AND pea.event_id = r.parent_event_id))
    )
  ),
  roots AS (
    SELECT es.id FROM public.event_settlements es
     JOIN allowed a ON a.id = es.event_id
    WHERE es.parent_id IS NULL
  ),
  tx AS (
    SELECT t.event_id, t.type::text AS tx_type, t.category_id,
           COALESCE(t.iva_rate, 0)::numeric AS iva_rate,
           t.amount::numeric AS amount,
           ROUND(t.amount * COALESCE(t.iva_rate, 0) / 100.0, 2) AS iva
    FROM public.transactions t
    JOIN allowed a ON a.id = t.event_id
    WHERE t.status IN ('approved', 'paid')
      AND COALESCE(t.is_transitory, false) = false
      AND COALESCE(t.exclude_from_result, false) = false
      AND t.reversed_at IS NULL
      AND COALESCE(t.is_hidden, false) = false
      AND (t.event_settlement_id IS NULL
           OR EXISTS (SELECT 1 FROM roots r WHERE r.id = t.event_settlement_id))
      AND (v_conf OR (COALESCE(t.is_confidential, false) = false
                      AND (t.account_id IS NULL
                           OR NOT EXISTS (SELECT 1 FROM public.financial_accounts fa
                                           WHERE fa.id = t.account_id AND fa.is_restricted))))
  )
  SELECT tx.event_id, tx.tx_type, tx.category_id, tx.iva_rate,
         ROUND(SUM(tx.amount), 2), ROUND(SUM(tx.iva), 2),
         ROUND(SUM(tx.amount) + SUM(tx.iva), 2), COUNT(*)::integer
  FROM tx
  GROUP BY tx.event_id, tx.tx_type, tx.category_id, tx.iva_rate;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_partner_settlement_summary(_event_id uuid, _settlement_id uuid, _partner_share numeric DEFAULT 0, _transfer_with_vat boolean DEFAULT false)
RETURNS TABLE(partner_share numeric, disbursement numeric, adjustments numeric, revenues_held numeric, extras numeric, transfer_base numeric, transfer_vat numeric, transfer_total numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supplier uuid;
  v_gross boolean := false;
  v_ids uuid[];
  v_pids uuid[];
  v_disb numeric := 0;
  v_adj numeric := 0;
  v_held numeric := 0;
  v_extras numeric := 0;
  v_base numeric := 0;
  v_vat numeric := 0;
BEGIN
  v_supplier := public.user_supplier_id(auth.uid());
  IF v_supplier IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.event_settlement_participants sp
    WHERE sp.settlement_id = _settlement_id
      AND sp.event_id = _event_id
      AND sp.mode = 'settles'
      AND sp.supplier_id = v_supplier
  ) THEN
    RETURN;
  END IF;

  SELECT (s.doc_locale = 'pt-BR') INTO v_gross FROM public.suppliers s WHERE s.id = v_supplier;

  SELECT array_agg(e.id) INTO v_ids
  FROM public.events e
  WHERE e.id = _event_id OR e.parent_event_id = _event_id;

  SELECT array_agg(x) INTO v_pids
  FROM public.user_event_partner_ids(auth.uid(), v_ids) x;
  v_pids := COALESCE(v_pids, ARRAY[]::uuid[]);

  SELECT COALESCE(SUM(t.amount * CASE WHEN v_gross THEN 1 + COALESCE(t.iva_rate, 0) / 100 ELSE 1 END), 0)
    INTO v_disb
  FROM public.partner_paid_expenses ppe
  JOIN public.transactions t ON t.id = ppe.transaction_id
  WHERE ppe.partner_id = ANY (v_pids) AND ppe.event_id = ANY (v_ids);

  SELECT v_disb + COALESCE(SUM(f.amount * CASE WHEN v_gross THEN 1 + COALESCE(f.iva_rate, 0) / 100 ELSE 1 END), 0)
    INTO v_disb
  FROM public.event_forecasts f
  WHERE f.paying_partner_id = ANY (v_pids)
    AND f.event_id = ANY (v_ids)
    AND f.type = 'expense'
    AND f.status = 'approved'
    AND f.version_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.partner_paid_expenses ppe2
      WHERE ppe2.transaction_id = f.transaction_id AND ppe2.partner_id = ANY (v_pids)
    );

  SELECT
    COALESCE(SUM(CASE WHEN x.kind = 'disbursement_adjustment' THEN x.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN x.kind = 'extra' THEN x.amount ELSE 0 END), 0)
    INTO v_adj, v_extras
  FROM public.event_partner_extras x
  WHERE x.partner_id = ANY (v_pids) AND x.event_id = ANY (v_ids);

  SELECT COALESCE(SUM(t.amount), 0) INTO v_held
  FROM public.transactions t
  JOIN public.financial_accounts fa ON fa.id = t.account_id
  WHERE fa.partner_id = ANY (v_pids)
    AND t.event_id = ANY (v_ids)
    AND t.type = 'income'
    AND t.reversed_at IS NULL
    AND t.status IN ('paid', 'approved');

  SELECT v_held + COALESCE(SUM(o.operator_result), 0) INTO v_held
  FROM public.event_third_party_operations o
  WHERE o.held_by_supplier_id = v_supplier AND o.event_id = ANY (v_ids);

  SELECT v_held + COALESCE(SUM(t.amount), 0) INTO v_held
  FROM public.transactions t
  WHERE t.held_by_supplier_id = v_supplier
    AND t.event_id = ANY (v_ids)
    AND t.type = 'income'
    AND t.reversed_at IS NULL
    AND t.status IN ('paid', 'approved');

  v_base := ROUND(COALESCE(_partner_share, 0) + v_disb + v_adj - v_held - v_extras, 2);
  IF _transfer_with_vat AND v_base > 0 THEN
    v_vat := ROUND(v_base * 0.23, 2);
  END IF;

  RETURN QUERY SELECT
    ROUND(COALESCE(_partner_share, 0), 2),
    ROUND(v_disb, 2), ROUND(v_adj, 2), ROUND(v_held, 2), ROUND(v_extras, 2),
    v_base, v_vat, ROUND(v_base + v_vat, 2);
END;
$function$;

-- PROVA AUTOMÁTICA (mesma transação; qualquer desvio faz rollback)
DO $prova$
DECLARE
  ev uuid := 'fdfb39fe-45f2-43f5-9ec9-7cb536360ae1';
  u_staff uuid := 'd8e502f7-9ceb-4dae-bd73-7291832d0d6f';
  u_lobo  uuid := '699c117d-a376-4760-8869-852faa87cb6b';
  u_ein   uuid := '28c63e6d-c541-4450-b2cc-ec4bf6d5dcce';
  sup_lobo uuid := '1d62b176-ba78-4fcb-9dc1-c467691797a9';
  s_root uuid := 'b415da54-9e6f-4556-a855-c774c2785305';
  s_lobo uuid := '55a48a9f-79ec-4a15-aa99-75cfa6e5815d';
  u uuid;
  n integer;
  got uuid;
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_staff,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.get_partner_event_shares(ev);
  IF n <> 0 THEN RAISE EXCEPTION 'staff shares mudou: % (baseline 0)', n; END IF;
  SELECT count(*) INTO n FROM public.get_partner_event_tx_aggregates(ARRAY[ev]);
  IF n <> 0 THEN RAISE EXCEPTION 'staff tx_aggregates mudou: % (baseline 0)', n; END IF;
  SELECT count(*) INTO n FROM public.get_partner_event_partner_expenses(ARRAY[ev]);
  IF n <> 0 THEN RAISE EXCEPTION 'staff partner_expenses mudou: % (baseline 0)', n; END IF;
  PERFORM set_config('role','postgres',true);
  IF NOT public.is_settlement_staff(u_staff) THEN RAISE EXCEPTION 'staff perdeu is_settlement_staff'; END IF;
  IF public.is_settlement_staff(u_lobo) OR public.is_settlement_staff(u_ein) THEN
    RAISE EXCEPTION 'socio passou a is_settlement_staff';
  END IF;

  FOREACH u IN ARRAY ARRAY[u_lobo, u_ein] LOOP
    PERFORM set_config('role','authenticated',true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
    SELECT count(*) INTO n FROM public.get_partner_event_shares(ev);
    IF n <> 0 THEN RAISE EXCEPTION 'socio % ve shares: %', u, n; END IF;
    SELECT count(*) INTO n FROM public.get_partner_event_partner_expenses(ARRAY[ev]);
    IF n <> 0 THEN RAISE EXCEPTION 'socio % ve partner_expenses: %', u, n; END IF;
    SELECT count(*) INTO n FROM public.get_partner_event_tx_aggregates(ARRAY[ev]);
    IF n <> 0 THEN RAISE EXCEPTION 'socio % ve tx_aggregates: %', u, n; END IF;
    SELECT count(*) INTO n FROM public.get_partner_visible_settlements(ev);
    IF n <> 0 THEN RAISE EXCEPTION 'socio % ve fechamentos: %', u, n; END IF;
    PERFORM set_config('role','postgres',true);
    SELECT count(*) INTO n FROM public.user_settlement_visible_ids(u);
    IF n <> 0 THEN RAISE EXCEPTION 'socio % tem fechamentos visiveis: %', u, n; END IF;
  END LOOP;

  PERFORM set_config('role','postgres',true);
  PERFORM set_config('request.jwt.claims','',true);

  -- Simulação RAFAEL LOBO: o predicado de get_partner_visible_settlements com o
  -- supplier real (sem DML) tem de devolver SÓ o "Fechamento Rafael Lobo".
  SELECT count(*) INTO n
  FROM public.event_settlement_participants sp
  JOIN public.event_settlements s ON s.id = sp.settlement_id
  WHERE sp.event_id = ev AND sp.mode = 'settles' AND sp.supplier_id = sup_lobo;
  IF n <> 1 THEN RAISE EXCEPTION 'lobo: esperado 1 fechamento onde settles, obtido %', n; END IF;

  SELECT sp.settlement_id INTO got
  FROM public.event_settlement_participants sp
  JOIN public.event_settlements s ON s.id = sp.settlement_id
  WHERE sp.event_id = ev AND sp.mode = 'settles' AND sp.supplier_id = sup_lobo
  ORDER BY COALESCE(s.position, 0), sp.settlement_id
  LIMIT 1;
  IF got <> s_lobo THEN RAISE EXCEPTION 'lobo: fechamento visivel errado %', got; END IF;
  IF got = s_root THEN RAISE EXCEPTION 'lobo: escolheu a raiz (presenca nominal)'; END IF;

  -- e a quota do nó dele existe (mode settles), ao contrário da raiz
  SELECT COALESCE(SUM(p.profit_pct),0) INTO n
  FROM public.event_settlement_participants p
  WHERE p.settlement_id = got AND p.mode = 'settles' AND p.supplier_id = sup_lobo;
  IF n <= 0 THEN RAISE EXCEPTION 'lobo: quota 0 no fechamento visivel'; END IF;

  RAISE NOTICE 'PROVA g9b OK';
END $prova$;