-- D-ERP264 — trg_enforce_camarim_item_bp_line. Corre numa transação e anula tudo no fim
-- (o RAISE final devolve o resultado dos 4 casos). Sessão real SM Lisboa (single_event, sem Master).
DO $$
DECLARE
  s uuid := '0403d64e-1b6c-4eb0-83c3-2d0aa4c3d811';
  ev uuid := '95051bc2-8580-405c-a1ad-f2526ddf9bd4';
  other_line uuid; own_line uuid; co uuid; r text := '';
BEGIN
  SELECT company_id INTO co FROM camarim_sessions WHERE id = s;
  SELECT f.id INTO other_line FROM event_forecasts f WHERE f.event_id = '5e56f568-506f-4469-8802-050182c6d479' AND f.version_id IS NULL LIMIT 1;
  SELECT f.id INTO own_line FROM event_forecasts f JOIN account_categories c ON c.id = f.category_id
   WHERE f.event_id = ev AND f.version_id IS NULL AND c.code = '2.6.04' LIMIT 1;

  BEGIN
    INSERT INTO camarim_items (company_id, session_id, event_id, total_amount, payment_origin, status, bp_scope, bp_forecast_id)
    VALUES (co, s, ev, 10, 'advance', 'draft', 'local_city', other_line);
    r := r || '1:ACEITE(erro) ';
  EXCEPTION WHEN check_violation THEN r := r || '1:recusado(' || SQLERRM || ') '; END;

  BEGIN
    INSERT INTO camarim_items (company_id, session_id, event_id, total_amount, payment_origin, status, bp_scope)
    VALUES (co, s, ev, 10, 'advance', 'draft', 'master_common');
    r := r || '2:ACEITE(erro) ';
  EXCEPTION WHEN check_violation THEN r := r || '2:recusado(' || SQLERRM || ') '; END;

  BEGIN
    INSERT INTO camarim_items (company_id, session_id, event_id, total_amount, payment_origin, status, bp_scope, bp_forecast_id)
    VALUES (co, s, ev, 10, 'advance', 'draft', 'local_city', own_line);
    r := r || '3:aceite ';
  EXCEPTION WHEN check_violation THEN r := r || '3:RECUSADO(erro: ' || SQLERRM || ') '; END;

  BEGIN
    INSERT INTO camarim_items (company_id, session_id, event_id, total_amount, payment_origin, status, bp_scope)
    VALUES (co, s, ev, 10, 'advance', 'draft', 'local_city');
    r := r || '4:aceite ';
  EXCEPTION WHEN check_violation THEN r := r || '4:RECUSADO(erro: ' || SQLERRM || ') '; END;

  RAISE EXCEPTION 'RESULTADO %', r;
END $$;
