-- Função de análise em lote: devolve sugestões para todas as linhas da Versão Ativa
CREATE OR REPLACE FUNCTION public.analyze_formalidade_bulk(_event_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  forecast_id uuid,
  event_id uuid,
  event_name text,
  description text,
  category_code text,
  category_name text,
  bp_amount numeric,
  current_formalidade public.bp_formalidade,
  suggested_formalidade public.bp_formalidade,
  confidence text,
  reason text,
  paid_total numeric,
  approved_total numeric,
  has_transaction boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tolerance numeric := 0.05;
BEGIN
  -- Apenas admins/managers
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'Sem permissão para analisar formalidade em massa';
  END IF;

  RETURN QUERY
  WITH active_forecasts AS (
    SELECT
      ef.id,
      ef.event_id,
      ef.description,
      ef.category_id,
      ef.amount AS bp_amount,
      ef.formalidade AS current_formalidade,
      ef.transaction_id
    FROM public.event_forecasts ef
    WHERE ef.version_id IS NULL
      AND ef.type = 'expense'
      AND ef.status NOT IN ('rejected')
      AND (_event_ids IS NULL OR ef.event_id = ANY(_event_ids))
  ),
  tx_totals AS (
    SELECT
      af.id AS fid,
      COALESCE(SUM(CASE WHEN t.status = 'paid' THEN t.amount ELSE 0 END), 0) AS paid_total,
      COALESCE(SUM(CASE WHEN t.status IN ('approved','paid') THEN t.amount ELSE 0 END), 0) AS approved_total,
      BOOL_OR(t.id IS NOT NULL) AS has_tx
    FROM active_forecasts af
    LEFT JOIN public.transactions t
      ON t.id = af.transaction_id
    GROUP BY af.id
  ),
  computed AS (
    SELECT
      af.id AS forecast_id,
      af.event_id,
      e.name AS event_name,
      af.description,
      ac.code AS category_code,
      ac.name AS category_name,
      af.bp_amount,
      af.current_formalidade,
      tt.paid_total,
      tt.approved_total,
      COALESCE(tt.has_tx, false) AS has_transaction,
      -- Inferência
      CASE
        WHEN tt.paid_total > 0 AND af.bp_amount > 0
             AND ABS(tt.paid_total - af.bp_amount) / af.bp_amount <= v_tolerance
          THEN 'pago_total'::public.bp_formalidade
        WHEN tt.paid_total > 0
          THEN 'pago_parcial'::public.bp_formalidade
        WHEN tt.approved_total > 0
          THEN 'fechado'::public.bp_formalidade
        ELSE af.current_formalidade
      END AS suggested
    FROM active_forecasts af
    LEFT JOIN tx_totals tt ON tt.fid = af.id
    LEFT JOIN public.events e ON e.id = af.event_id
    LEFT JOIN public.account_categories ac ON ac.id = af.category_id
  )
  SELECT
    c.forecast_id,
    c.event_id,
    c.event_name,
    c.description,
    c.category_code,
    c.category_name,
    c.bp_amount,
    c.current_formalidade,
    c.suggested AS suggested_formalidade,
    -- Confiança: alta quando muda ou quando há TX paga/aprovada com match claro
    CASE
      WHEN c.suggested = c.current_formalidade THEN 'none'
      WHEN c.suggested IN ('pago_total','pago_parcial') AND c.paid_total > 0 THEN 'high'
      WHEN c.suggested = 'fechado' AND c.approved_total > 0 THEN 'high'
      ELSE 'low'
    END AS confidence,
    -- Razão legível
    CASE
      WHEN c.suggested = c.current_formalidade THEN 'Estado já correto'
      WHEN c.suggested = 'pago_total' THEN
        format('TX paga: %s€ (BP: %s€) — match dentro de ±5%%', round(c.paid_total::numeric, 2), round(c.bp_amount::numeric, 2))
      WHEN c.suggested = 'pago_parcial' THEN
        format('TX paga parcial: %s€ de %s€', round(c.paid_total::numeric, 2), round(c.bp_amount::numeric, 2))
      WHEN c.suggested = 'fechado' THEN
        format('TX aprovada (não paga): %s€', round(c.approved_total::numeric, 2))
      ELSE 'Sem alteração sugerida'
    END AS reason,
    c.paid_total,
    c.approved_total,
    c.has_transaction
  FROM computed c
  WHERE c.suggested <> c.current_formalidade
  ORDER BY c.event_name, c.description;
END;
$$;

-- Função de aplicação em lote
CREATE OR REPLACE FUNCTION public.apply_formalidade_suggestions(
  _forecast_ids uuid[],
  _new_state public.bp_formalidade
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'Sem permissão para aplicar sugestões de formalidade';
  END IF;

  IF _forecast_ids IS NULL OR array_length(_forecast_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.event_forecasts
  SET formalidade = _new_state,
      formalidade_changed_at = now(),
      formalidade_changed_by = auth.uid()
  WHERE id = ANY(_forecast_ids)
    AND formalidade <> _new_state;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- Aplicação em lote por mapa (ids → estado distinto por linha)
CREATE OR REPLACE FUNCTION public.apply_formalidade_suggestions_map(
  _payload jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
  v_row record;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'Sem permissão para aplicar sugestões de formalidade';
  END IF;

  FOR v_row IN
    SELECT (item->>'forecast_id')::uuid AS fid,
           (item->>'new_state')::public.bp_formalidade AS state
    FROM jsonb_array_elements(_payload) AS item
  LOOP
    UPDATE public.event_forecasts
    SET formalidade = v_row.state,
        formalidade_changed_at = now(),
        formalidade_changed_by = auth.uid()
    WHERE id = v_row.fid
      AND formalidade <> v_row.state;
    IF FOUND THEN v_updated := v_updated + 1; END IF;
  END LOOP;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analyze_formalidade_bulk(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_formalidade_suggestions(uuid[], public.bp_formalidade) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_formalidade_suggestions_map(jsonb) TO authenticated;