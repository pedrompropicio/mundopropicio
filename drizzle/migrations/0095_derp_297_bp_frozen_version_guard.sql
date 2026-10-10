DO $mig$
DECLARE
  g text := E'\n  -- #297: só se escreve na linha viva (_version_id NULL) ou num cenário working_draft.\n  IF _version_id IS NOT NULL THEN\n    PERFORM 1 FROM public.bp_versions bv WHERE bv.id = _version_id AND bv.state = ''working_draft'';\n    IF NOT FOUND THEN\n      RAISE EXCEPTION ''Esta versão do Business Plan está congelada (só cenários em rascunho são editáveis).'' USING ERRCODE = ''42501'';\n    END IF;\n  END IF;\n\n';
  d text;
BEGIN
  d := pg_get_functiondef('public.batch_update_event_forecasts'::regproc);
  IF position('#297' in d) = 0 THEN
    d := replace(d, '  SELECT array_agg(id) INTO v_allowed_event_ids', g || '  SELECT array_agg(id) INTO v_allowed_event_ids');
    EXECUTE d;
  END IF;
  d := pg_get_functiondef('public.batch_insert_event_forecasts'::regproc);
  IF position('#297' in d) = 0 THEN
    d := replace(d, '  IF _inserts IS NULL OR jsonb_array_length(_inserts) = 0 THEN', g || '  IF _inserts IS NULL OR jsonb_array_length(_inserts) = 0 THEN');
    EXECUTE d;
  END IF;
END
$mig$;