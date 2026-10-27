-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.get_bp_l3_attachments(pg_catalog._uuid)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "16dc5e7fd5bac3e0f0b9c37b05391068c7d977c803ec9b197a0a67f4dad57931", "live_properties_sha256": "658f37e2b51c7085996e2c34672094348271b2fb0fe1be5845ae80f1a000b97c", "oid": 151392, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "3c66ce629bbd9646ce5ac272956f5218a9ebef66a834511dbec077aab7a7ffcd", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 0b320e8546d201e983caf03bfb3d0888475034d1e7e0e945885c4a6e30715df0
CREATE OR REPLACE FUNCTION public.get_bp_l3_attachments(_event_ids uuid[])
 RETURNS TABLE(event_id uuid, category_id uuid, kind text, document_id uuid, file_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _sup uuid;
  _allowed uuid[];
BEGIN
  IF _uid IS NULL OR _event_ids IS NULL OR array_length(_event_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  _sup := public.user_supplier_id(_uid);
  IF _sup IS NULL THEN
    RETURN;
  END IF;

  -- Acesso ao evento E participacao do socio representado nesse evento.
  SELECT array_agg(eid) INTO _allowed
  FROM unnest(_event_ids) AS eid
  WHERE public.user_has_event_access(_uid, eid)
    AND EXISTS (
      SELECT 1
      FROM public.event_partners ep
      LEFT JOIN public.events e ON e.id = eid
      WHERE ep.supplier_id = _sup
        AND (ep.event_id = eid OR ep.event_id = e.parent_event_id)
    );

  IF _allowed IS NULL THEN
    RETURN;
  END IF;

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
$function$
;

ALTER FUNCTION public.get_bp_l3_attachments(pg_catalog._uuid) OWNER TO "postgres";
-- END OPERATION 0b320e8546d201e983caf03bfb3d0888475034d1e7e0e945885c4a6e30715df0
