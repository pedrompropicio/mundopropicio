CREATE OR REPLACE FUNCTION public.event_bp_evolution(_event_id uuid, _from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_audit_from constant timestamptz := '2026-06-17'::timestamptz;
  v_company uuid;
  v_to date;
  v_from date;
  v_day date;
  r record;
  v_state jsonb := '{}'::jsonb;
  v_days jsonb := '[]'::jsonb;
  v_series jsonb;
  v_origin jsonb;
  v_markers jsonb;
  v_old_amt numeric;
  v_new_amt numeric;
  v_k text;
BEGIN
  SELECT e.company_id INTO v_company FROM public.events e WHERE e.id = _event_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Evento não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_platform_admin(auth.uid())
    OR public.has_permission_in(auth.uid(), 'view_bp', v_company)
    OR public.user_has_event_access(auth.uid(), _event_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para consultar a evolução do BP deste evento.' USING ERRCODE = '42501';
  END IF;

  v_to := LEAST(COALESCE(_to, current_date), current_date);
  v_from := GREATEST(COALESCE(_from, v_to - 89), v_audit_from::date);
  IF v_from > v_to THEN v_from := v_to; END IF;

  SELECT COALESCE(jsonb_object_agg(t.category_id::text, t.amt), '{}'::jsonb) INTO v_state
  FROM (
    SELECT f.category_id, SUM(COALESCE(f.amount, 0)) AS amt
    FROM public.event_forecasts f
    WHERE f.event_id = _event_id
      AND f.version_id IS NULL
      AND f.type = 'expense'
      AND f.category_id IS NOT NULL
    GROUP BY f.category_id
  ) t;

  v_day := current_date;

  FOR r IN
    SELECT l.created_at,
           l.action,
           NULLIF(l.old_data->>'category_id','')::uuid AS old_cat,
           NULLIF(l.new_data->>'category_id','')::uuid AS new_cat,
           NULLIF(l.old_data->>'amount','')::numeric   AS old_amount,
           NULLIF(l.new_data->>'amount','')::numeric   AS new_amount,
           (l.old_data->>'type') AS old_type,
           (l.new_data->>'type') AS new_type,
           (l.old_data->>'version_id') AS old_version,
           (l.new_data->>'version_id') AS new_version
    FROM public.system_audit_log l
    WHERE l.entity_type = 'event_forecasts'
      AND COALESCE(l.new_data->>'event_id', l.old_data->>'event_id') = _event_id::text
      AND l.created_at >= v_audit_from
    ORDER BY l.created_at DESC
  LOOP
    WHILE v_day >= v_from AND r.created_at < (v_day + 1)::timestamptz LOOP
      IF v_day <= v_to THEN
        v_days := v_days || jsonb_build_object('day', v_day, 'state', v_state);
      END IF;
      v_day := v_day - 1;
    END LOOP;
    EXIT WHEN v_day < v_from;

    v_old_amt := COALESCE(r.old_amount, 0);
    v_new_amt := COALESCE(r.new_amount, 0);

    IF r.action IN ('create','update') AND r.new_cat IS NOT NULL
       AND r.new_type = 'expense' AND r.new_version IS NULL THEN
      v_k := r.new_cat::text;
      v_state := jsonb_set(v_state, ARRAY[v_k],
        to_jsonb(COALESCE((v_state->>v_k)::numeric, 0) - v_new_amt), true);
    END IF;

    IF r.action IN ('delete','update') AND r.old_cat IS NOT NULL
       AND r.old_type = 'expense' AND r.old_version IS NULL THEN
      v_k := r.old_cat::text;
      v_state := jsonb_set(v_state, ARRAY[v_k],
        to_jsonb(COALESCE((v_state->>v_k)::numeric, 0) + v_old_amt), true);
    END IF;
  END LOOP;

  WHILE v_day >= v_from LOOP
    IF v_day <= v_to THEN
      v_days := v_days || jsonb_build_object('day', v_day, 'state', v_state);
    END IF;
    v_day := v_day - 1;
  END LOOP;

  -- série montada num único passo (dia × rubrica L3)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'day', d.day,
           'l3_code', c.code,
           'l3_name', c.name,
           'l2_code', p2.code,
           'l1_code', p1.code,
           'amount', round(e.v::numeric, 2)
         ) ORDER BY d.day, c.code), '[]'::jsonb) INTO v_series
  FROM jsonb_array_elements(v_days) AS x
  CROSS JOIN LATERAL (SELECT (x->>'day')::date AS day, x->'state' AS state) d
  CROSS JOIN LATERAL jsonb_each_text(d.state) AS e(k, v)
  JOIN public.account_categories c ON c.id = e.k::uuid
  LEFT JOIN public.account_categories p2 ON p2.id = c.parent_id
  LEFT JOIN public.account_categories p1 ON p1.id = p2.parent_id
  WHERE round(e.v::numeric, 2) <> 0;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'l3_code'), '[]'::jsonb) INTO v_origin
  FROM (
    SELECT jsonb_build_object(
             'l3_code', c.code, 'l3_name', c.name,
             'l2_code', p2.code, 'l1_code', p1.code,
             'amount', round(SUM(COALESCE(f.baseline_amount, f.amount, 0)), 2)
           ) AS x
    FROM public.event_forecasts f
    JOIN public.account_categories c ON c.id = f.category_id
    LEFT JOIN public.account_categories p2 ON p2.id = c.parent_id
    LEFT JOIN public.account_categories p1 ON p1.id = p2.parent_id
    WHERE f.event_id = _event_id AND f.version_id IS NULL AND f.type = 'expense'
    GROUP BY c.code, c.name, p2.code, p1.code
  ) q;

  SELECT COALESCE(jsonb_agg(m ORDER BY m->>'at'), '[]'::jsonb) INTO v_markers
  FROM (
    SELECT jsonb_build_object(
             'kind', 'version', 'at', v.created_at,
             'label', 'Versão ' || v.version_number,
             'total', (
               SELECT round(COALESCE(SUM(COALESCE((fx->>'amount')::numeric, 0)), 0), 2)
               FROM jsonb_array_elements(COALESCE(v.snapshot_payload->'forecasts', '[]'::jsonb)) fx
               WHERE fx->>'type' = 'expense'
             )
           ) AS m
    FROM public.bp_versions v
    WHERE v.event_id = _event_id AND v.state IN ('active','superseded')
    UNION ALL
    SELECT jsonb_build_object(
             'kind', 'annotated_change', 'at', a.created_at,
             'label', a.observation, 'total', NULL
           ) AS m
    FROM public.forecast_audit_log a
    JOIN public.event_forecasts f ON f.id = a.forecast_id
    WHERE f.event_id = _event_id AND f.type = 'expense'
      AND a.observation IS NOT NULL AND btrim(a.observation) <> ''
      AND a.created_at >= v_audit_from
  ) q2;

  RETURN jsonb_build_object(
    'series', v_series,
    'origin', v_origin,
    'markers', v_markers,
    'audit_from', to_char(v_audit_from, 'YYYY-MM-DD'),
    'from', v_from,
    'to', v_to
  );
END;
$function$;

DROP FUNCTION IF EXISTS public._bp_evolution_day(date, jsonb);

REVOKE EXECUTE ON FUNCTION public.event_bp_evolution(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_bp_evolution(uuid, date, date) TO authenticated;