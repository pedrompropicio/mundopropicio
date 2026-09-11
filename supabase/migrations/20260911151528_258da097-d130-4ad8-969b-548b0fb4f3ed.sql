-- D-ERP38 — Portão de permissão e isolamento de empresa nas funções de BP
DO $mig$
DECLARE
  r RECORD;
  v_def text;
  v_gate text;
  v_resolve text;
  v_author text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname,
           CASE p.proname
             WHEN 'create_bp_snapshot' THEN
               'SELECT e.company_id INTO v_company FROM public.events e WHERE e.id = _event_id;'
             WHEN 'promote_scenario_to_active' THEN
               'SELECT e.company_id INTO v_company FROM public.bp_versions v JOIN public.events e ON e.id = v.event_id WHERE v.id = _scenario_version_id;'
             ELSE
               'SELECT e.company_id INTO v_company FROM public.bp_versions v JOIN public.events e ON e.id = v.event_id WHERE v.id = _version_id;'
           END AS resolve,
           CASE p.proname
             WHEN 'create_bp_snapshot' THEN '_created_by := COALESCE(auth.uid(), _created_by);'
             ELSE '_performed_by := COALESCE(auth.uid(), _performed_by);'
           END AS author
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('promote_scenario_to_active','revert_to_bp_version','create_bp_snapshot',
                         'archive_bp_version','unarchive_bp_version','discard_bp_version_draft')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_resolve := r.resolve;
    v_author := r.author;

    v_gate :=
      '  -- D-ERP38: portao de permissao e isolamento de empresa.' || E'\n' ||
      '  DECLARE' || E'\n' ||
      '    v_uid uuid := auth.uid();' || E'\n' ||
      '    v_company uuid;' || E'\n' ||
      '  BEGIN' || E'\n' ||
      '    -- auth.uid() NULL = service_role / cron / edge function: isencao deliberada,' || E'\n' ||
      '    -- mesmo padrao de enforce_transaction_approval_permission.' || E'\n' ||
      '    IF v_uid IS NOT NULL THEN' || E'\n' ||
      '      IF NOT (public.is_platform_admin(v_uid)' || E'\n' ||
      '              OR public.has_role(v_uid, ''admin''::app_role)' || E'\n' ||
      '              OR public.has_permission(v_uid, ''manage_bp'')) THEN' || E'\n' ||
      '        RAISE EXCEPTION ''Sem permissão para gerir o Business Plan deste evento.'' USING ERRCODE = ''42501'';' || E'\n' ||
      '      END IF;' || E'\n' ||
      '      IF NOT public.is_platform_admin(v_uid) THEN' || E'\n' ||
      '        ' || v_resolve || E'\n' ||
      '        IF v_company IS NULL OR v_company IS DISTINCT FROM public.current_company_id() THEN' || E'\n' ||
      '          RAISE EXCEPTION ''Sem permissão para gerir o Business Plan deste evento.'' USING ERRCODE = ''42501'';' || E'\n' ||
      '        END IF;' || E'\n' ||
      '      END IF;' || E'\n' ||
      '    END IF;' || E'\n' ||
      '  END;' || E'\n' ||
      '  -- D-ERP38: autoria nao forjavel. Com utilizador, ignora o parametro recebido;' || E'\n' ||
      '  -- com auth.uid() NULL (service_role) usa-se o parametro como antes.' || E'\n' ||
      '  ' || v_author || E'\n';

    v_def := regexp_replace(v_def, E'\nBEGIN\n', E'\nBEGIN\n' || v_gate);
    EXECUTE v_def;
  END LOOP;
END
$mig$;

DO $mig$
DECLARE
  v_def text;
  v_gate text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'mark_forecasts_fechado_auto';

  v_gate :=
    '  -- D-ERP38: portao de permissao e isolamento de empresa.' || E'\n' ||
    '  DECLARE' || E'\n' ||
    '    v_uid uuid := auth.uid();' || E'\n' ||
    '  BEGIN' || E'\n' ||
    '    -- auth.uid() NULL = service_role / cron: isencao deliberada.' || E'\n' ||
    '    IF v_uid IS NOT NULL THEN' || E'\n' ||
    '      IF NOT (public.is_platform_admin(v_uid)' || E'\n' ||
    '              OR public.has_role(v_uid, ''admin''::app_role)' || E'\n' ||
    '              OR public.has_permission(v_uid, ''manage_bp'')) THEN' || E'\n' ||
    '        RAISE EXCEPTION ''Sem permissão para gerir o Business Plan deste evento.'' USING ERRCODE = ''42501'';' || E'\n' ||
    '      END IF;' || E'\n' ||
    '      IF NOT public.is_platform_admin(v_uid) AND EXISTS (' || E'\n' ||
    '        SELECT 1 FROM public.event_forecasts f' || E'\n' ||
    '         WHERE f.id = ANY(_ids)' || E'\n' ||
    '           AND (f.company_id IS NULL OR f.company_id IS DISTINCT FROM public.current_company_id())' || E'\n' ||
    '      ) THEN' || E'\n' ||
    '        RAISE EXCEPTION ''Sem permissão para gerir o Business Plan deste evento.'' USING ERRCODE = ''42501'';' || E'\n' ||
    '      END IF;' || E'\n' ||
    '    END IF;' || E'\n' ||
    '  END;' || E'\n';

  v_def := regexp_replace(v_def, E'\nBEGIN\n', E'\nBEGIN\n' || v_gate);
  EXECUTE v_def;
END
$mig$;

DO $mig$
DECLARE
  v_def text;
  v_gate text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'expire_supplier_credits';

  v_gate :=
    '  -- D-ERP38: portao de permissao. Normalmente corre por cron como' || E'\n' ||
    '  -- service_role (auth.uid() NULL) - isencao deliberada.' || E'\n' ||
    '  DECLARE' || E'\n' ||
    '    v_uid uuid := auth.uid();' || E'\n' ||
    '  BEGIN' || E'\n' ||
    '    IF v_uid IS NOT NULL AND NOT (public.is_platform_admin(v_uid)' || E'\n' ||
    '        OR public.has_role(v_uid, ''admin''::app_role)' || E'\n' ||
    '        OR public.has_permission(v_uid, ''manage_bp'')) THEN' || E'\n' ||
    '      RAISE EXCEPTION ''Sem permissão para gerir o Business Plan deste evento.'' USING ERRCODE = ''42501'';' || E'\n' ||
    '    END IF;' || E'\n' ||
    '  END;' || E'\n';

  v_def := regexp_replace(v_def, E'\nBEGIN\n', E'\nBEGIN\n' || v_gate);
  EXECUTE v_def;
END
$mig$;

CREATE OR REPLACE FUNCTION public.event_close_blockers(_event_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN NOT (
      auth.uid() IS NULL
      OR public.is_platform_admin(auth.uid())
      OR (SELECT e.company_id FROM public.events e WHERE e.id = _event_id) = public.current_company_id()
    ) THEN NULL::jsonb
  ELSE jsonb_build_object(
    'hard', jsonb_build_object(
      'camarim_sessions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', cs.id, 'title', cs.title, 'status', cs.status) ORDER BY cs.title)
        FROM public.camarim_sessions cs
        WHERE cs.status <> 'integrated'
          AND (
            cs.master_event_id = _event_id
            OR EXISTS (
              SELECT 1 FROM public.camarim_session_events cse
              WHERE cse.session_id = cs.id AND cse.event_id = _event_id
            )
          )
      ), '[]'::jsonb),
      'card_sessions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', s.id,
                 'holder_name', s.holder_name,
                 'card_name', fa.name,
                 'status', s.status
               ) ORDER BY s.opened_at)
        FROM public.card_sessions s
        LEFT JOIN public.financial_accounts fa ON fa.id = s.card_account_id
        WHERE s.status <> 'closed'
          AND (
            s.primary_event_id = _event_id
            OR EXISTS (
              SELECT 1 FROM public.card_session_items i
              WHERE i.session_id = s.id AND i.event_id = _event_id
                AND i.status IN ('submitted','approved')
            )
            OR EXISTS (
              SELECT 1 FROM public.transactions t
              WHERE t.card_session_id = s.id AND t.event_id = _event_id
            )
          )
      ), '[]'::jsonb)
    ),
    'soft', jsonb_build_object(
      'pending_expenses', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', t.id,
                 'description', t.description,
                 'amount', t.amount,
                 'status', t.status,
                 'supplier_name', sup.name,
                 'due_date', t.due_date
               ) ORDER BY t.due_date NULLS LAST, t.amount DESC)
        FROM public.transactions t
        LEFT JOIN public.suppliers sup ON sup.id = t.supplier_id
        WHERE t.event_id = _event_id
          AND t.type = 'expense'
          AND t.status IN ('pending','overdue')
          AND t.reversed_at IS NULL
      ), '[]'::jsonb)
    )
  ) END;
$function$;

CREATE OR REPLACE FUNCTION public.ads_event_windows(p_company_id uuid)
 RETURNS TABLE(event_id uuid, root_id uuid, win_start date, win_end date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH gate AS (
    SELECT (auth.uid() IS NULL
            OR public.is_platform_admin(auth.uid())
            OR p_company_id = public.current_company_id()) AS ok
  ),
  fs AS (
    SELECT z.event_id AS eid, min(ts.sale_date) AS d
      FROM public.ticket_sales ts
      JOIN public.event_ticket_zones z ON z.id = ts.zone_id
     GROUP BY 1
    UNION ALL
    SELECT t.event_id, min(t.sale_date) FROM public.ticketline_daily_sales t GROUP BY 1
    UNION ALL
    SELECT b.event_id, min(b.sale_date) FROM public.bol_daily_sales b GROUP BY 1
  ),
  first_sale AS (SELECT eid, min(d) AS d FROM fs WHERE eid IS NOT NULL GROUP BY 1),
  ev AS (
    SELECT e.id, e.parent_event_id, e.date AS end_own, f.d AS start_own,
           coalesce(e.parent_event_id, e.id) AS root
      FROM public.events e
      LEFT JOIN first_sale f ON f.eid = e.id
     WHERE e.company_id = p_company_id
  ),
  kids AS (
    SELECT parent_event_id AS pid, min(start_own) AS s, max(end_own) AS e
      FROM ev WHERE parent_event_id IS NOT NULL GROUP BY 1
  )
  SELECT ev.id, ev.root,
         least(ev.start_own, k.s)::date,
         greatest(ev.end_own, k.e)::date
    FROM ev LEFT JOIN kids k ON k.pid = ev.id
   WHERE (SELECT ok FROM gate)
$function$;

CREATE OR REPLACE FUNCTION public.get_user_max_daily_budget_eur(_user_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  SELECT CASE WHEN NOT (
      auth.uid() IS NULL
      OR public.is_platform_admin(auth.uid())
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
         WHERE ur.user_id = _user_id AND ur.company_id = public.current_company_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles pr
         WHERE pr.id = _user_id AND pr.company_id = public.current_company_id()
      )
    ) THEN NULL::numeric
  ELSE (
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN crm.role_budget_limits rbl ON rbl.role = ur.role
        WHERE ur.user_id = _user_id AND rbl.max_daily_budget_eur IS NULL
      ) THEN NULL
      WHEN EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN crm.role_budget_limits rbl ON rbl.role = ur.role
        WHERE ur.user_id = _user_id
      ) THEN (
        SELECT MAX(rbl.max_daily_budget_eur)
        FROM public.user_roles ur
        JOIN crm.role_budget_limits rbl ON rbl.role = ur.role
        WHERE ur.user_id = _user_id
      )
      ELSE 0
    END
  ) END;
$function$;

GRANT EXECUTE ON FUNCTION public.promote_scenario_to_active(uuid, text, uuid, text, boolean, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.revert_to_bp_version(uuid, boolean, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_bp_snapshot(uuid, text, boolean, text, jsonb, boolean, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_bp_version(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unarchive_bp_version(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.discard_bp_version_draft(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_forecasts_fechado_auto(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_supplier_credits() TO service_role;
GRANT EXECUTE ON FUNCTION public.event_close_blockers(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.ads_event_windows(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_max_daily_budget_eur(uuid) TO service_role;