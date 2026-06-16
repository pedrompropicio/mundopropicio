-- RPC para Agrupada do portal parceiro listar anexos das linhas do BP
-- SECURITY DEFINER: ignora gate view_partner_documents da policy transaction_documents_select_partner.
-- Valida via user_has_event_access para garantir que o caller vê o evento.
CREATE OR REPLACE FUNCTION public.get_bp_line_attachments(_event_ids uuid[])
RETURNS TABLE (
  forecast_id uuid,
  kind text,           -- 'transaction_document' | 'event_forecast_attachment'
  document_id uuid,
  file_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _allowed uuid[];
BEGIN
  IF _uid IS NULL OR _event_ids IS NULL OR array_length(_event_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Filtra para os event_ids onde o caller tem acesso (Master ou directo).
  SELECT array_agg(eid) INTO _allowed
  FROM unnest(_event_ids) AS eid
  WHERE public.user_has_event_access(_uid, eid);

  IF _allowed IS NULL THEN
    RETURN;
  END IF;

  -- 1) Anexos das transações ligadas a forecasts (via forecast.transaction_id)
  RETURN QUERY
  SELECT
    f.id AS forecast_id,
    'transaction_document'::text AS kind,
    td.id AS document_id,
    coalesce(td.name, 'documento') AS file_name
  FROM public.event_forecasts f
  JOIN public.transaction_documents td ON td.transaction_id = f.transaction_id
  WHERE f.event_id = ANY(_allowed)
    AND f.transaction_id IS NOT NULL
    AND td.file_url IS NOT NULL
    AND td.file_url NOT LIKE 'ref://%';

  -- 2) Uploads reais ao próprio forecast (event_forecast_attachments)
  RETURN QUERY
  SELECT
    a.forecast_id,
    'event_forecast_attachment'::text AS kind,
    a.id AS document_id,
    a.file_name
  FROM public.event_forecast_attachments a
  JOIN public.event_forecasts f ON f.id = a.forecast_id
  WHERE f.event_id = ANY(_allowed);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bp_line_attachments(uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_bp_line_attachments(uuid[]) FROM anon, PUBLIC;