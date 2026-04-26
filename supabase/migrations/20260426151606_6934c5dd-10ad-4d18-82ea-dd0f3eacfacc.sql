CREATE OR REPLACE FUNCTION public.mark_forecasts_fechado_auto(_ids uuid[])
RETURNS TABLE(id uuid, previous_formalidade public.bp_formalidade)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Marca esta transação como auto-sugerida (lida pelo trigger trg_log_formalidade_change).
  PERFORM set_config('app.formalidade_auto_suggested', 'true', true);

  RETURN QUERY
  WITH snapshot AS (
    SELECT ef.id, ef.formalidade AS previous_formalidade
    FROM public.event_forecasts ef
    WHERE ef.id = ANY(_ids)
  ),
  upd AS (
    UPDATE public.event_forecasts ef
       SET formalidade = 'fechado'
     WHERE ef.id = ANY(_ids)
    RETURNING ef.id
  )
  SELECT s.id, s.previous_formalidade FROM snapshot s
  WHERE s.id IN (SELECT id FROM upd);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_forecasts_fechado_auto(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_forecasts_fechado_auto(uuid[]) TO authenticated;