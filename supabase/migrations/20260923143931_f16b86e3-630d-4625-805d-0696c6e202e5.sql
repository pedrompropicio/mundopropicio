-- ── Issue #239 / D-ERP131 — revisão de fecho por linha de BP ──────────────

CREATE TABLE public.event_bp_line_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  forecast_id uuid NOT NULL REFERENCES public.event_forecasts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  decision text NOT NULL CHECK (decision IN ('pending_invoice','partner_paid','adjusted')),
  saldo_at_review numeric NOT NULL,
  note text,
  reviewed_by uuid NOT NULL DEFAULT auth.uid(),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX event_bp_line_reviews_forecast_idx
  ON public.event_bp_line_reviews (forecast_id, reviewed_at DESC);
CREATE INDEX event_bp_line_reviews_event_idx
  ON public.event_bp_line_reviews (event_id);

GRANT SELECT, INSERT ON public.event_bp_line_reviews TO authenticated;
GRANT ALL ON public.event_bp_line_reviews TO service_role;

ALTER TABLE public.event_bp_line_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_bp_line_reviews_select_privileged_roles"
  ON public.event_bp_line_reviews FOR SELECT TO authenticated
  USING (public.has_staff_role((SELECT auth.uid())));

CREATE POLICY "manage_bp can insert bp line reviews"
  ON public.event_bp_line_reviews FOR INSERT TO authenticated
  WITH CHECK (
    reviewed_by = (SELECT auth.uid())
    AND public.has_permission_in((SELECT auth.uid()), 'manage_bp', company_id)
  );

CREATE POLICY "company_isolation_event_bp_line_reviews"
  ON public.event_bp_line_reviews AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

COMMENT ON TABLE public.event_bp_line_reviews IS
  'Append-only. Decisão de fecho por linha de BP (#239): custo real por faturar, pago por sócio, ou previsto ajustado. saldo_at_review é SEMPRE s/IVA; se o saldo actual divergir mais de 0,01 a revisão fica desactualizada.';

-- ── reduce_forecast_budget: espelho de raise_forecast_budget ───────────────
CREATE OR REPLACE FUNCTION public.reduce_forecast_budget(
  _forecast_id uuid, _new_amount numeric, _observation text
) RETURNS public.event_forecasts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.event_forecasts;
  v_old_amount numeric;
  v_realized numeric;
  v_actor text;
  v_is_service boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    v_is_service := COALESCE(
      current_setting('request.jwt.claims', true)::jsonb->>'role', ''
    ) = 'service_role';
    IF NOT v_is_service THEN
      RAISE EXCEPTION 'Sem identidade de utilizador para ajustar verbas de BP.' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_row FROM public.event_forecasts WHERE id = _forecast_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha de BP não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_is_service THEN
    IF NOT (
      public.is_platform_admin(v_uid)
      OR public.has_permission_in(v_uid, 'manage_bp', v_row.company_id)
    ) THEN
      RAISE EXCEPTION 'Sem permissão para ajustar verbas de BP nesta empresa.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF _observation IS NULL OR btrim(_observation) = '' THEN
    RAISE EXCEPTION 'Observação obrigatória para ajustar a verba da linha de BP.' USING ERRCODE = '22023';
  END IF;

  v_old_amount := COALESCE(v_row.amount, 0);

  IF _new_amount IS NULL OR _new_amount >= v_old_amount THEN
    RAISE EXCEPTION 'A nova verba tem de ser inferior à verba actual da linha.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(t.amount), 0) INTO v_realized
  FROM public.transactions t
  WHERE t.forecast_id = _forecast_id
    AND t.type = 'expense'
    AND t.status IN ('approved','paid','partially_paid')
    AND COALESCE(t.is_transitory, false) = false
    AND COALESCE(t.exclude_from_result, false) = false
    AND t.reversed_at IS NULL
    AND COALESCE(t.is_hidden, false) = false;

  IF _new_amount < v_realized - 0.005 THEN
    RAISE EXCEPTION 'A nova verba (%) não pode ficar abaixo do realizado da linha (%).',
      to_char(_new_amount, 'FM999999999990.00'), to_char(v_realized, 'FM999999999990.00')
      USING ERRCODE = '22023';
  END IF;

  IF v_is_service THEN
    v_actor := 'service_role';
  ELSE
    SELECT COALESCE(p.email, v_uid::text) INTO v_actor
    FROM public.profiles p WHERE p.id = v_uid;
    v_actor := COALESCE(v_actor, v_uid::text);
  END IF;

  -- NUNCA toca em baseline_amount (D3): o previsto original é fixo.
  UPDATE public.event_forecasts
     SET amount = _new_amount,
         updated_at = now()
   WHERE id = _forecast_id
  RETURNING * INTO v_row;

  INSERT INTO public.forecast_audit_log (
    forecast_id, changed_by, field_name, old_value, new_value, observation, company_id
  ) VALUES (
    _forecast_id,
    v_actor,
    'Valor (EUR)',
    to_char(v_old_amount, 'FM999999999990.00'),
    to_char(_new_amount, 'FM999999999990.00'),
    '[ajuste de fecho] ' || btrim(_observation),
    v_row.company_id
  );

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.reduce_forecast_budget(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reduce_forecast_budget(uuid, numeric, text) TO authenticated, service_role;

-- ── event_close_blockers: soft.bp_lines_unreviewed ─────────────────────────
CREATE OR REPLACE FUNCTION public.event_close_blockers(_event_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH scope AS (
    SELECT e.id, e.parent_event_id
    FROM public.events e
    WHERE e.id = _event_id
  ),
  scope_ids AS (
    SELECT _event_id AS id
    UNION
    SELECT s.parent_event_id FROM scope s WHERE s.parent_event_id IS NOT NULL
    UNION
    SELECT e2.id
    FROM public.events e2, scope s
    WHERE e2.parent_event_id = COALESCE(s.parent_event_id, _event_id)
  ),
  circuit_accounts AS (
    SELECT DISTINCT fa.id, fa.name, COALESCE(fa.skip_balance_check, false) AS skip_balance_check
    FROM public.transactions t
    JOIN public.financial_accounts fa ON fa.id = t.shared_cost_account_id
    WHERE t.shared_cost_account_id IS NOT NULL
      AND COALESCE(fa.is_circuit_account, false) = true
      AND t.event_id IN (SELECT id FROM scope_ids)
  ),
  circuit_positions AS (
    SELECT ca.id,
           ca.name,
           ca.skip_balance_check,
           CASE WHEN ca.skip_balance_check THEN NULL
                ELSE public._account_true_balance_raw(ca.id) END AS position
    FROM circuit_accounts ca
  ),
  -- (#239) Verba por usar por LINHA de BP, medida pelo forecast_id.
  bp_lines AS (
    SELECT f.id,
           COALESCE(f.amount, 0) - COALESCE((
             SELECT SUM(t.amount) FROM public.transactions t
             WHERE t.forecast_id = f.id
               AND t.type = 'expense'
               AND t.status IN ('approved','paid','partially_paid')
               AND COALESCE(t.is_transitory, false) = false
               AND COALESCE(t.exclude_from_result, false) = false
               AND t.reversed_at IS NULL
               AND COALESCE(t.is_hidden, false) = false
           ), 0) AS saldo
    FROM public.event_forecasts f
    WHERE f.event_id = _event_id
      AND f.version_id IS NULL
      AND f.type = 'expense'
      AND f.status = 'approved'
      AND COALESCE(f.is_overhead, false) = false
      AND COALESCE(f.exclude_from_result, false) = false
      AND COALESCE(f.is_transitory, false) = false
  ),
  bp_unreviewed AS (
    SELECT l.id, l.saldo
    FROM bp_lines l
    WHERE l.saldo > 0.005
      AND NOT EXISTS (
        SELECT 1 FROM (
          SELECT r.saldo_at_review
          FROM public.event_bp_line_reviews r
          WHERE r.forecast_id = l.id
          ORDER BY r.reviewed_at DESC
          LIMIT 1
        ) last
        WHERE ABS(last.saldo_at_review - l.saldo) <= 0.01
      )
  )
  SELECT CASE WHEN NOT (
      auth.uid() IS NULL
      OR public.is_platform_admin(auth.uid())
      OR (SELECT e.company_id FROM public.events e WHERE e.id = _event_id) = public.current_company_id()
    ) THEN NULL::jsonb
  ELSE jsonb_build_object(
    'hard', jsonb_build_object(
      'camarim_sessions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', cs.id, 'title', cs.title, 'status', cs.status) ORDER BY cs.title)
        FROM public.camarim_sessions cs
        WHERE cs.status <> 'integrated'
          AND (
            cs.master_event_id = _event_id
            OR EXISTS (
              SELECT 1 FROM public.camarim_session_events cse
              WHERE cse.session_id = cs.id AND cse.event_id = _event_id
            )
          )
      ), '[]'::jsonb),
      'card_sessions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', s.id,
                 'holder_name', s.holder_name,
                 'card_name', fa.name,
                 'status', s.status
               ) ORDER BY s.opened_at)
        FROM public.card_sessions s
        LEFT JOIN public.financial_accounts fa ON fa.id = s.card_account_id
        WHERE s.status <> 'closed'
          AND (
            s.primary_event_id = _event_id
            OR EXISTS (
              SELECT 1 FROM public.card_session_items i
              WHERE i.session_id = s.id AND i.event_id = _event_id
                AND i.status IN ('submitted','approved')
            )
            OR EXISTS (
              SELECT 1 FROM public.transactions t
              WHERE t.card_session_id = s.id AND t.event_id = _event_id
            )
          )
      ), '[]'::jsonb),
      'circuit_accounts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', cp.id,
                 'name', cp.name,
                 'position', ROUND(cp.position, 2),
                 'skip_balance_check', cp.skip_balance_check,
                 'message', CASE
                   WHEN cp.skip_balance_check THEN
                     'A conta de circuito "' || cp.name || '" esta com "Ignorar controlo de saldo" ligado: a posicao do circuito nao pode ser verificada. Desliga a opcao nas Contas de Movimentacao e confirma que a posicao esta a zero antes de fechar.'
                   ELSE
                     'A conta de circuito "' || cp.name || '" tem posicao de ' || to_char(ROUND(cp.position, 2), 'FM999999999D00') || ' EUR em vez de zero. Falta lancar o custo da MP por rubrica pago por esta conta, registar a devolucao do terceiro, ou apurar a quota da MP.'
                 END
               ) ORDER BY cp.name)
        FROM circuit_positions cp
        WHERE cp.skip_balance_check
           OR ABS(COALESCE(cp.position, 0)) > 0.01
      ), '[]'::jsonb)
    ),
    'soft', jsonb_build_object(
      'pending_expenses', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', t.id,
                 'description', t.description,
                 'amount', t.amount,
                 'status', t.status,
                 'supplier_name', sup.name,
                 'due_date', t.due_date
               ) ORDER BY t.due_date NULLS LAST, t.amount DESC)
        FROM public.transactions t
        LEFT JOIN public.suppliers sup ON sup.id = t.supplier_id
        WHERE t.event_id = _event_id
          AND t.type = 'expense'
          AND t.status IN ('pending','overdue')
          AND t.reversed_at IS NULL
      ), '[]'::jsonb),
      'bp_lines_unreviewed', CASE
        WHEN public.event_budget_mode(_event_id) = 'with_bp' THEN (
          SELECT jsonb_build_object(
            'count', COUNT(*),
            'saldo_net', ROUND(COALESCE(SUM(u.saldo), 0), 2)
          ) FROM bp_unreviewed u
        )
        ELSE jsonb_build_object('count', 0, 'saldo_net', 0)
      END
    )
  ) END;
$function$;