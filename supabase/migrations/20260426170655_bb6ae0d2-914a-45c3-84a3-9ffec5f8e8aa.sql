-- Recria a RPC para adicionar fallback de matching por evento+categoria quando não há transaction_id direto
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
  -- Match direto por transaction_id
  direct_tx AS (
    SELECT
      af.id AS fid,
      COALESCE(SUM(CASE WHEN t.status = 'paid' THEN t.amount ELSE 0 END), 0) AS paid_total,
      COALESCE(SUM(CASE WHEN t.status IN ('approved','paid') THEN t.amount ELSE 0 END), 0) AS approved_total,
      BOOL_OR(t.id IS NOT NULL) AS has_tx
    FROM active_forecasts af
    LEFT JOIN public.transactions t ON t.id = af.transaction_id
    GROUP BY af.id
  ),
  -- Match por similaridade (mesmo evento + mesma categoria) quando não há vínculo direto
  category_tx AS (
    SELECT
      af.id AS fid,
      COALESCE(SUM(CASE WHEN t.status = 'paid' THEN t.amount ELSE 0 END), 0) AS paid_total,
      COALESCE(SUM(CASE WHEN t.status IN ('approved','paid') THEN t.amount ELSE 0 END), 0) AS approved_total,
      COUNT(t.id) AS tx_count
    FROM active_forecasts af
    LEFT JOIN public.transactions t
      ON t.event_id = af.event_id
     AND t.category_id = af.category_id
     AND t.status IN ('paid','approved')
    WHERE af.transaction_id IS NULL
      AND af.category_id IS NOT NULL
    GROUP BY af.id
    HAVING COUNT(t.id) > 0
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
      -- Totais combinados (direto OU por categoria)
      COALESCE(dt.paid_total, ct.paid_total, 0) AS paid_total,
      COALESCE(dt.approved_total, ct.approved_total, 0) AS approved_total,
      COALESCE(dt.has_tx, false) AS has_direct_tx,
      (ct.fid IS NOT NULL) AS has_category_match,
      ct.tx_count AS category_tx_count,
      -- Inferência (mesma lógica para ambas as fontes)
      CASE
        WHEN COALESCE(dt.paid_total, ct.paid_total, 0) > 0 AND af.bp_amount > 0
             AND ABS(COALESCE(dt.paid_total, ct.paid_total, 0) - af.bp_amount) / af.bp_amount <= v_tolerance
          THEN 'pago_total'::public.bp_formalidade
        WHEN COALESCE(dt.paid_total, ct.paid_total, 0) > 0
          THEN 'pago_parcial'::public.bp_formalidade
        WHEN COALESCE(dt.approved_total, ct.approved_total, 0) > 0
          THEN 'fechado'::public.bp_formalidade
        ELSE af.current_formalidade
      END AS suggested
    FROM active_forecasts af
    LEFT JOIN direct_tx dt ON dt.fid = af.id
    LEFT JOIN category_tx ct ON ct.fid = af.id
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
    -- Confiança: alta = vínculo direto; baixa = match por categoria
    CASE
      WHEN c.suggested = c.current_formalidade THEN 'none'
      WHEN c.has_direct_tx AND c.suggested IN ('pago_total','pago_parcial') AND c.paid_total > 0 THEN 'high'
      WHEN c.has_direct_tx AND c.suggested = 'fechado' AND c.approved_total > 0 THEN 'high'
      ELSE 'low'
    END AS confidence,
    -- Razão legível
    CASE
      WHEN c.suggested = c.current_formalidade THEN 'Estado já correto'
      WHEN c.has_direct_tx AND c.suggested = 'pago_total' THEN
        format('TX vinculada paga: %s€ (BP: %s€) — match dentro de ±5%%',
          round(c.paid_total::numeric, 2), round(c.bp_amount::numeric, 2))
      WHEN c.has_direct_tx AND c.suggested = 'pago_parcial' THEN
        format('TX vinculada paga parcial: %s€ de %s€',
          round(c.paid_total::numeric, 2), round(c.bp_amount::numeric, 2))
      WHEN c.has_direct_tx AND c.suggested = 'fechado' THEN
        format('TX vinculada aprovada (não paga): %s€', round(c.approved_total::numeric, 2))
      WHEN c.has_category_match AND c.suggested = 'pago_total' THEN
        format('Sem vínculo direto — %s TX paga(s) na mesma categoria/evento totalizando %s€ (BP: %s€)',
          c.category_tx_count, round(c.paid_total::numeric, 2), round(c.bp_amount::numeric, 2))
      WHEN c.has_category_match AND c.suggested = 'pago_parcial' THEN
        format('Sem vínculo direto — %s TX paga(s) na mesma categoria/evento: %s€ de %s€',
          c.category_tx_count, round(c.paid_total::numeric, 2), round(c.bp_amount::numeric, 2))
      WHEN c.has_category_match AND c.suggested = 'fechado' THEN
        format('Sem vínculo direto — %s TX aprovada(s) na mesma categoria/evento: %s€',
          c.category_tx_count, round(c.approved_total::numeric, 2))
      ELSE 'Sem alteração sugerida'
    END AS reason,
    c.paid_total,
    c.approved_total,
    (c.has_direct_tx OR c.has_category_match) AS has_transaction
  FROM computed c
  WHERE c.suggested <> c.current_formalidade
  ORDER BY c.event_name, c.description;
END;
$$;