-- Incidente 05/10/2026 (39 chamadas num clique): aprovação ATÓMICA.
-- Elevação de verba (D2) + UPDATE de status + auditoria numa só transação.
-- Linhas trancadas com FOR UPDATE SKIP LOCKED: um pedido concorrente nunca
-- aprova nem eleva a verba duas vezes. A autorização fica na edge function.
CREATE OR REPLACE FUNCTION public.approve_transactions_atomic(
  p_ids uuid[],
  p_raises jsonb,
  p_caller_name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked uuid[];
  v_skipped uuid[];
  v_excess jsonb := '[]'::jsonb;
  v_applied jsonb := '[]'::jsonb;
  v_bad jsonb;
  r record;
  v_raise jsonb;
  v_new numeric;
  v_obs text;
  v_caller text := coalesce(nullif(trim(p_caller_name), ''), 'sistema');
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('approved_ids', '[]'::jsonb, 'skipped_ids', '[]'::jsonb, 'applied_raises', '[]'::jsonb);
  END IF;

  -- a) tranca as aprováveis; o resto é skipped (já aprovado ou em curso).
  CREATE TEMP TABLE IF NOT EXISTS _ata_locked (
    id uuid PRIMARY KEY, status text, type text, amount numeric, iva_rate numeric,
    company_id uuid, forecast_id uuid, parent_transaction_id uuid
  ) ON COMMIT DROP;
  TRUNCATE _ata_locked;

  INSERT INTO _ata_locked
  SELECT t.id, t.status::text, t.type::text, t.amount, t.iva_rate, t.company_id, t.forecast_id, t.parent_transaction_id
  FROM public.transactions t
  WHERE t.id = ANY(p_ids) AND t.status IN ('pending', 'overdue')
  FOR UPDATE SKIP LOCKED;

  SELECT coalesce(array_agg(id), '{}') INTO v_locked FROM _ata_locked;
  SELECT coalesce(array_agg(x), '{}') INTO v_skipped
  FROM unnest(p_ids) x WHERE NOT (x = ANY(v_locked));

  IF array_length(v_locked, 1) IS NULL THEN
    RETURN jsonb_build_object('approved_ids', '[]'::jsonb, 'skipped_ids', to_jsonb(v_skipped), 'applied_raises', '[]'::jsonb);
  END IF;

  -- Tranca também as linhas de BP envolvidas (serializa elevações concorrentes).
  PERFORM 1 FROM public.event_forecasts f
  WHERE f.id IN (SELECT forecast_id FROM _ata_locked
                 WHERE type = 'expense' AND forecast_id IS NOT NULL AND parent_transaction_id IS NULL)
  FOR UPDATE;

  -- b) excesso por linha de BP (mesmo cálculo e isenções da edge — D2/D11).
  FOR r IN
    WITH entries AS (
      SELECT * FROM _ata_locked
      WHERE type = 'expense' AND forecast_id IS NOT NULL AND parent_transaction_id IS NULL
    ),
    realized AS (
      SELECT t.forecast_id, sum(coalesce(t.amount, 0)) AS v
      FROM public.transactions t
      WHERE t.forecast_id IN (SELECT forecast_id FROM entries)
        AND t.status IN ('approved', 'paid')
        AND NOT (t.id = ANY(v_locked))
        AND coalesce(t.is_transitory, false) = false
        AND coalesce(t.exclude_from_result, false) = false
        AND t.reversed_at IS NULL
        AND coalesce(t.is_hidden, false) = false
        AND t.shared_cost_account_id IS NULL
      GROUP BY t.forecast_id
    ),
    to_approve AS (
      SELECT forecast_id,
             sum(coalesce(amount, 0)) AS base,
             sum(round(coalesce(amount, 0) + round(coalesce(amount, 0) * coalesce(iva_rate, 0) / 100, 2), 2)) AS gross
      FROM entries GROUP BY forecast_id
    )
    SELECT l.id AS forecast_id,
           coalesce(nullif(concat_ws(' · ', nullif(l.description, ''), nullif(l.specification, '')), ''), '(sem descrição)') AS description,
           round(coalesce(l.amount, 0)::numeric, 2) AS line_amount,
           CASE WHEN l.baseline_amount IS NULL THEN NULL ELSE round(l.baseline_amount::numeric, 2) END AS baseline_amount,
           round(coalesce(re.v, 0)::numeric, 2) AS realized,
           round(coalesce(ta.base, 0)::numeric, 2) AS to_approve,
           round(coalesce(ta.gross, 0)::numeric, 2) AS to_approve_gross,
           l.company_id
    FROM public.event_forecasts l
    JOIN to_approve ta ON ta.forecast_id = l.id
    LEFT JOIN realized re ON re.forecast_id = l.id
  LOOP
    IF round(r.realized + r.to_approve - r.line_amount, 2) > 0 THEN
      v_excess := v_excess || jsonb_build_array(jsonb_build_object(
        'forecast_id', r.forecast_id,
        'description', r.description,
        'line_amount', r.line_amount,
        'baseline_amount', r.baseline_amount,
        'realized', r.realized,
        'to_approve', r.to_approve,
        'excess', round(r.realized + r.to_approve - r.line_amount, 2),
        'suggested_amount', round(r.realized + r.to_approve, 2),
        'to_approve_gross', r.to_approve_gross,
        'to_approve_iva', round(r.to_approve_gross - r.to_approve, 2),
        'company_id', r.company_id
      ));
    END IF;
  END LOOP;

  -- Exige raise válido para TODAS as linhas em excesso; senão nada é gravado.
  IF jsonb_array_length(v_excess) > 0 THEN
    SELECT coalesce(jsonb_agg(e), '[]'::jsonb) INTO v_bad
    FROM jsonb_array_elements(v_excess) e
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_raises) = 'array' THEN p_raises ELSE '[]'::jsonb END) rz
      WHERE rz->>'forecast_id' = e->>'forecast_id'
        AND (rz->>'new_amount') ~ '^-?[0-9]+(\.[0-9]+)?$'
        AND round((rz->>'new_amount')::numeric, 2) >= (e->>'suggested_amount')::numeric
        AND length(trim(coalesce(rz->>'observation', ''))) > 0
    );
    IF jsonb_array_length(v_bad) > 0 THEN
      RAISE EXCEPTION 'Há despesas que excedem a verba da linha de BP.'
        USING ERRCODE = 'P0409', DETAIL = v_excess::text;
    END IF;

    -- c) aplica os raises (baseline_amount NUNCA — D3).
    FOR v_raise IN SELECT e FROM jsonb_array_elements(v_excess) e LOOP
      SELECT round((rz->>'new_amount')::numeric, 2), trim(rz->>'observation')
        INTO v_new, v_obs
      FROM jsonb_array_elements(p_raises) rz
      WHERE rz->>'forecast_id' = v_raise->>'forecast_id'
      LIMIT 1;

      UPDATE public.event_forecasts SET amount = v_new
      WHERE id = (v_raise->>'forecast_id')::uuid;

      INSERT INTO public.forecast_audit_log (forecast_id, changed_by, field_name, old_value, new_value, observation, company_id)
      VALUES ((v_raise->>'forecast_id')::uuid, v_caller, 'Valor (EUR)',
              to_char((v_raise->>'line_amount')::numeric, 'FM999999999990.00'),
              to_char(v_new, 'FM999999999990.00'), v_obs, (v_raise->>'company_id')::uuid);

      v_applied := v_applied || jsonb_build_array(jsonb_build_object(
        'forecast_id', v_raise->>'forecast_id',
        'old_amount', (v_raise->>'line_amount')::numeric,
        'new_amount', v_new,
        'observation', v_obs
      ));
    END LOOP;
  END IF;

  -- UPDATE de status + auditoria só das trancadas.
  UPDATE public.transactions t SET status = 'approved'
  WHERE t.id = ANY(v_locked);

  INSERT INTO public.transaction_audit_log (transaction_id, company_id, changed_by, field_name, old_value, new_value)
  SELECT l.id, l.company_id, v_caller, 'status', coalesce(l.status, 'pending'), 'approved'
  FROM _ata_locked l;

  -- Rasto D2 nas transações que motivaram a elevação.
  INSERT INTO public.transaction_audit_log (transaction_id, company_id, changed_by, field_name, old_value, new_value)
  SELECT l.id, l.company_id, v_caller, 'bp_budget_raised', NULL,
         'Verba da linha elevada de ' || to_char((a->>'old_amount')::numeric, 'FM999999999990.00')
         || ' € para ' || to_char((a->>'new_amount')::numeric, 'FM999999999990.00') || ' € — ' || (a->>'observation')
  FROM _ata_locked l
  JOIN jsonb_array_elements(v_applied) a ON (a->>'forecast_id')::uuid = l.forecast_id
  WHERE l.type = 'expense' AND l.parent_transaction_id IS NULL;

  -- Filhas de rateio: mesma regra condicional, auditoria só das que mudaram.
  WITH ch AS (
    SELECT c.id, c.status::text AS status, c.company_id
    FROM public.transactions c
    WHERE c.parent_transaction_id = ANY(v_locked) AND c.status IN ('pending', 'overdue')
    FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.transactions t SET status = 'approved'
    FROM ch WHERE t.id = ch.id
    RETURNING ch.id, ch.status AS old_status, ch.company_id
  )
  INSERT INTO public.transaction_audit_log (transaction_id, company_id, changed_by, field_name, old_value, new_value)
  SELECT id, company_id, v_caller, 'status', coalesce(old_status, 'pending'), 'approved' FROM upd;

  RETURN jsonb_build_object(
    'approved_ids', to_jsonb(v_locked),
    'skipped_ids', to_jsonb(v_skipped),
    'applied_raises', v_applied
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_transactions_atomic(uuid[], jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_transactions_atomic(uuid[], jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_transactions_atomic(uuid[], jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_transactions_atomic(uuid[], jsonb, text) TO service_role;