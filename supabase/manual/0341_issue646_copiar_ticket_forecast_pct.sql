-- PREPARADA, NÃO APLICADA — #646, cópia guardada separada da estrutura.
-- Apenas após Publish/autorização próprios. Uma invocação/transacção por empresa.
-- Template psql: parâmetros obrigatórios sem UUIDs/dados operacionais.
-- company_id, rollout_version (= legacy-0289-v1), expected_source_sha256,
-- expected_source_count, expected_target_sha256, expected_target_count.
-- O 0 revê previamente o snapshot canónico abaixo e o mapa esperado ordenado.
-- Hash = encode(sha256(convert_to(jsonb::text, 'UTF8')), 'hex'); contagem origem = eventos.
-- Mapa: array de objectos (event_id, session_date, session_start_time, session_sort_order,
-- percentagem), ordenado por evento/data NULLS FIRST/hora NULLS FIRST/ordem NULLS FIRST.
-- Capturar a prova com TimeZone=UTC; executar com current_user=service_role.
-- Sessões equivalentes entre versões recebem uma só linha lógica; não se copiam UUIDs.
-- Locks de tabela são intencionalmente conservadores: bloqueiam também inserções fantasma.
-- Agendar janela curta; não alargar a múltiplas empresas na mesma transacção.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT set_config('issue646.company_id', :'company_id', true),
       set_config('issue646.rollout_version', :'rollout_version', true),
       set_config('issue646.source_sha256', :'expected_source_sha256', true),
       set_config('issue646.source_count', :'expected_source_count', true),
       set_config('issue646.target_sha256', :'expected_target_sha256', true),
       set_config('issue646.target_count', :'expected_target_count', true);
DO $copy$
DECLARE
  v_company uuid := current_setting('issue646.company_id')::uuid;
  v_version text := current_setting('issue646.rollout_version');
  v_source jsonb; v_source_hash text; v_source_count integer;
  v_expected jsonb := '[]'::jsonb; v_actual jsonb; v_target_hash text;
  v_event record; v_parent record; v_scenario record; v_session record; v_line jsonb;
  v_seen uuid[]; v_root uuid; v_next uuid; v_pct numeric; v_receipt record;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'ticket_forecast_copy_service_role_required' USING ERRCODE = '42501';
  END IF;
  IF v_company IS NULL OR v_version <> 'legacy-0289-v1'
    OR current_setting('issue646.source_sha256') !~ '^[0-9a-f]{64}$'
    OR current_setting('issue646.target_sha256') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'ticket_forecast_copy_invalid_parameters';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('issue646:' || v_company::text, 0));
  LOCK TABLE public.companies, public.events, public.bp_versions, public.event_sessions,
    public.event_coverage_scenarios, public.event_ticket_forecast_pct,
    public.event_ticket_forecast_rollouts IN SHARE ROW EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company) THEN
    RAISE EXCEPTION 'ticket_forecast_copy_company_missing';
  END IF;
  -- Releitura integral sob locks; datas/IVA/manual/viragem/horizonte também ficam ligados ao hash.
  -- SOURCE SNAPSHOT BEGIN
  SELECT jsonb_build_object(
    'events', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM
      (SELECT id, company_id, parent_event_id FROM public.events WHERE company_id = v_company) x), '[]'::jsonb),
    'scenarios', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.event_id)
      FROM public.event_coverage_scenarios c JOIN public.events e ON e.id = c.event_id
      WHERE e.company_id = v_company), '[]'::jsonb),
    'sessions', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM
      (SELECT s.id, s.company_id, s.event_id, s.date, s.start_time, s.sort_order, s.version_id
       FROM public.event_sessions s JOIN public.events e ON e.id = s.event_id WHERE e.company_id = v_company) x), '[]'::jsonb),
    'versions', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM
      (SELECT v.id, v.event_id FROM public.bp_versions v JOIN public.events e ON e.id = v.event_id
       WHERE e.company_id = v_company) x), '[]'::jsonb)
  ) INTO v_source;
  -- SOURCE SNAPSHOT END
  v_source_count := jsonb_array_length(v_source->'events');
  v_source_hash := encode(sha256(convert_to(v_source::text, 'UTF8')), 'hex');
  IF v_source_hash IS DISTINCT FROM current_setting('issue646.source_sha256')
    OR v_source_count <> current_setting('issue646.source_count')::integer THEN
    RAISE EXCEPTION 'ticket_forecast_copy_source_changed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_coverage_scenarios c JOIN public.events e ON e.id = c.event_id
    WHERE (e.company_id = v_company OR c.company_id = v_company) AND c.company_id IS DISTINCT FROM e.company_id)
    OR EXISTS (SELECT 1 FROM public.event_sessions s JOIN public.events e ON e.id = s.event_id
    LEFT JOIN public.bp_versions v ON v.id = s.version_id
    WHERE (e.company_id = v_company OR s.company_id = v_company)
      AND (s.company_id IS DISTINCT FROM e.company_id OR
        (s.version_id IS NOT NULL AND (v.id IS NULL OR v.event_id IS DISTINCT FROM s.event_id)))) THEN
    RAISE EXCEPTION 'ticket_forecast_copy_company_or_version_mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_sessions s JOIN public.events e ON e.id = s.event_id
    WHERE e.company_id = v_company GROUP BY s.event_id, s.date, s.start_time, s.sort_order, s.version_id
    HAVING count(*) <> 1) THEN
    RAISE EXCEPTION 'ticket_forecast_copy_session_ambiguous';
  END IF;
  FOR v_event IN SELECT * FROM public.events WHERE company_id = v_company ORDER BY id LOOP
    v_seen := ARRAY[v_event.id]; v_root := v_event.id; v_next := v_event.parent_event_id;
    WHILE v_next IS NOT NULL LOOP
      IF v_next = ANY(v_seen) THEN RAISE EXCEPTION 'ticket_forecast_copy_cycle'; END IF;
      SELECT * INTO v_parent FROM public.events WHERE id = v_next;
      IF NOT FOUND OR v_parent.company_id IS DISTINCT FROM v_company THEN
        RAISE EXCEPTION 'ticket_forecast_copy_parent_company_mismatch';
      END IF;
      v_seen := array_append(v_seen, v_next); v_root := v_next; v_next := v_parent.parent_event_id;
    END LOOP;
    -- Só próprio ou raiz, tal como o cenário legado; não herdar de um intermédio.
    SELECT c.* INTO v_scenario FROM public.event_coverage_scenarios c
      WHERE c.event_id IN (v_event.id, v_root) ORDER BY (c.event_id = v_event.id) DESC LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF v_scenario.company_id IS DISTINCT FROM v_company OR v_scenario.modo NOT IN ('real','previsao')
      OR v_scenario.modo IS NULL OR v_scenario.percentagem IS NULL
      OR NOT (v_scenario.percentagem BETWEEN 0 AND 100) OR v_scenario.percentagem = 'NaN'::numeric
      OR v_scenario.percentagem IS DISTINCT FROM round(v_scenario.percentagem, 2) THEN
      RAISE EXCEPTION 'ticket_forecast_copy_invalid_source';
    END IF;
    v_pct := CASE WHEN v_scenario.modo = 'real' THEN 0 ELSE v_scenario.percentagem END;
    v_expected := v_expected || jsonb_build_array(jsonb_build_object('event_id', v_event.id,
      'session_date', NULL, 'session_start_time', NULL, 'session_sort_order', NULL, 'percentagem', v_pct));
    FOR v_session IN SELECT DISTINCT s.date, s.start_time, s.sort_order
      FROM public.event_sessions s WHERE s.event_id = v_event.id
      ORDER BY s.date, s.start_time NULLS FIRST, s.sort_order LOOP
      v_expected := v_expected || jsonb_build_array(jsonb_build_object('event_id', v_event.id,
        'session_date', v_session.date, 'session_start_time', v_session.start_time,
        'session_sort_order', v_session.sort_order, 'percentagem', v_pct));
    END LOOP;
  END LOOP;
  -- Normalização explícita: a comparação é de mapas completos, nunca só de somas/contagens.
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.event_id, x.session_date NULLS FIRST,
    x.session_start_time NULLS FIRST, x.session_sort_order NULLS FIRST), '[]'::jsonb) INTO v_expected
  FROM jsonb_to_recordset(v_expected) AS x(event_id uuid, session_date date, session_start_time time,
    session_sort_order integer, percentagem numeric(5,2));
  v_target_hash := encode(sha256(convert_to(v_expected::text, 'UTF8')), 'hex');
  IF v_target_hash IS DISTINCT FROM current_setting('issue646.target_sha256')
    OR jsonb_array_length(v_expected) <> current_setting('issue646.target_count')::integer THEN
    RAISE EXCEPTION 'ticket_forecast_copy_expected_map_changed';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('event_id', p.event_id, 'session_date', p.session_date,
    'session_start_time', p.session_start_time, 'session_sort_order', p.session_sort_order,
    'percentagem', p.percentagem) ORDER BY p.event_id, p.session_date NULLS FIRST,
    p.session_start_time NULLS FIRST, p.session_sort_order NULLS FIRST), '[]'::jsonb) INTO v_actual
    FROM public.event_ticket_forecast_pct p WHERE p.company_id = v_company;
  SELECT * INTO v_receipt FROM public.event_ticket_forecast_rollouts WHERE company_id = v_company;
  IF FOUND THEN
    IF v_receipt.version IS DISTINCT FROM v_version OR v_receipt.source_sha256 IS DISTINCT FROM v_source_hash
      OR v_receipt.target_sha256 IS DISTINCT FROM v_target_hash OR v_receipt.source_count <> v_source_count
      OR v_receipt.target_count <> jsonb_array_length(v_expected) OR v_actual IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'ticket_forecast_copy_receipt_or_target_diverged';
    END IF;
    RETURN; -- Reexecução exacta: nenhuma escrita, nem log.
  END IF;
  -- Um alvo parcial idêntico pode ser completado; qualquer linha extra/divergente recusa tudo.
  IF EXISTS (SELECT value FROM jsonb_array_elements(v_actual)
    EXCEPT SELECT value FROM jsonb_array_elements(v_expected)) THEN
    RAISE EXCEPTION 'ticket_forecast_copy_target_diverged';
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_expected) LOOP
    IF NOT v_actual @> jsonb_build_array(v_line) THEN
      INSERT INTO public.event_ticket_forecast_pct(event_id, session_date, session_start_time, session_sort_order, percentagem)
      VALUES ((v_line->>'event_id')::uuid, (v_line->>'session_date')::date,
        (v_line->>'session_start_time')::time, (v_line->>'session_sort_order')::integer,
        (v_line->>'percentagem')::numeric);
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('event_id', p.event_id, 'session_date', p.session_date,
    'session_start_time', p.session_start_time, 'session_sort_order', p.session_sort_order,
    'percentagem', p.percentagem) ORDER BY p.event_id, p.session_date NULLS FIRST,
    p.session_start_time NULLS FIRST, p.session_sort_order NULLS FIRST), '[]'::jsonb) INTO v_actual
    FROM public.event_ticket_forecast_pct p WHERE p.company_id = v_company;
  -- Q5=A: ambas as diferenças vazias, mais igualdade exacta do mapa ordenado.
  IF v_actual IS DISTINCT FROM v_expected
    OR EXISTS (SELECT value FROM jsonb_array_elements(v_expected) EXCEPT SELECT value FROM jsonb_array_elements(v_actual))
    OR EXISTS (SELECT value FROM jsonb_array_elements(v_actual) EXCEPT SELECT value FROM jsonb_array_elements(v_expected)) THEN
    RAISE EXCEPTION 'ticket_forecast_copy_incomplete';
  END IF;
  INSERT INTO public.event_ticket_forecast_rollouts(company_id, version, source_sha256, target_sha256, source_count, target_count)
  VALUES (v_company, v_version, v_source_hash, v_target_hash, v_source_count, jsonb_array_length(v_expected));
END $copy$;
COMMIT;
