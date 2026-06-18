-- Nova RPC: anexos do BP agregados por categoria L3 (event_id + category_id).
-- Para uma dada categoria L3 dentro dos eventos a que o sócio tem acesso, devolve:
--   1) Anexos de TODAS as transações dessa L3 (approved/paid, não transitórias, não excluídas do resultado)
--   2) Uploads diretos aos forecasts dessa L3 (event_forecast_attachments)
-- Mantém SECURITY DEFINER + user_has_event_access.

CREATE OR REPLACE FUNCTION public.get_bp_l3_attachments(_event_ids uuid[])
RETURNS TABLE(event_id uuid, category_id uuid, kind text, document_id uuid, file_name text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _allowed uuid[];
BEGIN
  IF _uid IS NULL OR _event_ids IS NULL OR array_length(_event_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(eid) INTO _allowed
  FROM unnest(_event_ids) AS eid
  WHERE public.user_has_event_access(_uid, eid);

  IF _allowed IS NULL THEN
    RETURN;
  END IF;

  -- 1) Anexos de transações por categoria L3 (todas as TXs da rubrica)
  RETURN QUERY
  SELECT
    t.event_id,
    t.category_id,
    'transaction_document'::text AS kind,
    td.id AS document_id,
    coalesce(td.name, 'documento') AS file_name
  FROM public.transactions t
  JOIN public.transaction_documents td ON td.transaction_id = t.id
  WHERE t.event_id = ANY(_allowed)
    AND t.category_id IS NOT NULL
    AND coalesce(t.status, '') IN ('approved', 'paid')
    AND coalesce(t.is_transitory, false) = false
    AND coalesce(t.exclude_from_result, false) = false
    AND td.file_url IS NOT NULL
    AND td.file_url NOT LIKE 'ref://%';

  -- 2) Anexos diretos a forecasts (agregados pela mesma categoria L3 do forecast)
  RETURN QUERY
  SELECT
    f.event_id,
    f.category_id,
    'event_forecast_attachment'::text AS kind,
    a.id AS document_id,
    a.file_name
  FROM public.event_forecast_attachments a
  JOIN public.event_forecasts f ON f.id = a.forecast_id
  WHERE f.event_id = ANY(_allowed)
    AND f.category_id IS NOT NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_bp_l3_attachments(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bp_l3_attachments(uuid[]) TO authenticated;