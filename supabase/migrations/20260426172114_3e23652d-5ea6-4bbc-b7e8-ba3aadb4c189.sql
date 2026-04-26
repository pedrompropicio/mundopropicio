CREATE OR REPLACE FUNCTION public.formalidade_audit_stats(_event_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  total_lines integer,
  total_events integer,
  with_direct_tx integer,
  with_category_match integer,
  without_any_match integer,
  count_estimado integer,
  count_fechado integer,
  count_pago_parcial integer,
  count_pago_total integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'Sem permissão para consultar estatísticas de formalidade';
  END IF;

  RETURN QUERY
  WITH active_forecasts AS (
    SELECT
      ef.id,
      ef.event_id,
      ef.category_id,
      ef.transaction_id,
      ef.formalidade
    FROM public.event_forecasts ef
    WHERE ef.version_id IS NULL
      AND ef.type = 'expense'
      AND ef.status NOT IN ('rejected')
      AND (_event_ids IS NULL OR ef.event_id = ANY(_event_ids))
  ),
  enriched AS (
    SELECT
      af.*,
      (af.transaction_id IS NOT NULL) AS has_direct,
      EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.event_id = af.event_id
          AND t.category_id = af.category_id
          AND t.status IN ('paid','approved')
      ) AS has_cat_match
    FROM active_forecasts af
  )
  SELECT
    COUNT(*)::int AS total_lines,
    COUNT(DISTINCT event_id)::int AS total_events,
    COUNT(*) FILTER (WHERE has_direct)::int AS with_direct_tx,
    COUNT(*) FILTER (WHERE NOT has_direct AND has_cat_match)::int AS with_category_match,
    COUNT(*) FILTER (WHERE NOT has_direct AND NOT has_cat_match)::int AS without_any_match,
    COUNT(*) FILTER (WHERE formalidade = 'estimado')::int AS count_estimado,
    COUNT(*) FILTER (WHERE formalidade = 'fechado')::int AS count_fechado,
    COUNT(*) FILTER (WHERE formalidade = 'pago_parcial')::int AS count_pago_parcial,
    COUNT(*) FILTER (WHERE formalidade = 'pago_total')::int AS count_pago_total
  FROM enriched;
END;
$$;

GRANT EXECUTE ON FUNCTION public.formalidade_audit_stats(uuid[]) TO authenticated;