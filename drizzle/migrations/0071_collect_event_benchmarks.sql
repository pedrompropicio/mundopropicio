-- #89 movimento 1: colher benchmarks no fecho (idempotente).
CREATE OR REPLACE FUNCTION public.collect_event_benchmarks(_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ev record; v_total numeric; v_buckets int := 0; v_pax int := 0; v_pc numeric; v_n int;
BEGIN
  SELECT id, date, company_id INTO v_ev FROM public.events WHERE id = _event_id;
  IF v_ev.id IS NULL THEN RAISE EXCEPTION 'Evento % não existe', _event_id; END IF;
  IF auth.uid() IS NOT NULL THEN
    IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
            OR has_permission(auth.uid(),'manage_bp') OR is_platform_admin(auth.uid())) THEN
      RAISE EXCEPTION 'Sem permissão para colher benchmarks' USING ERRCODE = '42501';
    END IF;
    IF v_ev.company_id IS DISTINCT FROM current_company_id() AND NOT is_platform_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Evento de outra empresa' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_ev.date IS NULL THEN RAISE EXCEPTION 'Evento sem data — não há dia relativo'; END IF;

  -- 1) Curva de vendas: % acumulada por dia relativo D-180…D0 (vendas antes de D-180 caem em D-180; depois do evento em D0).
  DELETE FROM public.event_simulator_sales_curve_buckets WHERE event_id = _event_id;
  SELECT COALESCE(sum(ts.quantity),0) INTO v_total
    FROM public.ticket_sales ts JOIN public.event_ticket_zones z ON z.id = ts.zone_id
   WHERE z.event_id = _event_id AND ts.quantity > 0;
  IF v_total > 0 THEN
    INSERT INTO public.event_simulator_sales_curve_buckets (event_id, days_before, cumulative_pct)
    SELECT _event_id, d.db,
           round(100.0 * COALESCE((SELECT sum(ts.quantity)
              FROM public.ticket_sales ts JOIN public.event_ticket_zones z ON z.id = ts.zone_id
             WHERE z.event_id = _event_id AND ts.quantity > 0
               AND (v_ev.date - COALESCE(ts.sale_date_to, ts.sale_date)) >= d.db), 0) / v_total, 4)
      FROM generate_series(0,180) AS d(db);
    GET DIAGNOSTICS v_buckets = ROW_COUNT;
  END IF;

  -- 2) Per capita A&B (bebidas, 1.1.02): agregado global da empresa, recalculado do zero
  --    a partir de todas as zonas A&B com faturação real (idempotente, sem duplicar contributos).
  SELECT sum(a.faturacao_real_bebidas),
         sum(COALESCE(a.participants_manual,
             (SELECT sum(ts.quantity) FROM public.ticket_sales ts WHERE ts.zone_id = a.source_ticket_zone_id)))::int,
         count(DISTINCT a.event_id)::int
    INTO v_pc, v_pax, v_n
    FROM public.event_ab_zones a JOIN public.events e ON e.id = a.event_id
   WHERE e.company_id = v_ev.company_id AND a.faturacao_real_bebidas IS NOT NULL;
  DELETE FROM public.event_simulator_pax_benchmarks
   WHERE company_id = v_ev.company_id AND scope = 'global' AND category_code = '1.1.02';
  IF COALESCE(v_pax,0) > 0 THEN
    INSERT INTO public.event_simulator_pax_benchmarks
      (company_id, scope, scope_value, category_code, sample_size, avg_ticket_per_pax, last_calculated_at)
    VALUES (v_ev.company_id, 'global', 'all', '1.1.02', v_n, round(v_pc / v_pax, 4), now());
  END IF;

  RETURN jsonb_build_object('ok', true, 'event_id', _event_id, 'tickets', v_total,
    'curve_buckets', v_buckets, 'ab_events', COALESCE(v_n,0), 'ab_pax', COALESCE(v_pax,0),
    'ab_per_capita', CASE WHEN COALESCE(v_pax,0) > 0 THEN round(v_pc / v_pax, 4) END);
END $fn$;

REVOKE ALL ON FUNCTION public.collect_event_benchmarks(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collect_event_benchmarks(uuid) TO authenticated, service_role;

-- Chamada no selar: falha na colheita nunca impede o selo (só WARNING).
CREATE OR REPLACE FUNCTION public.seal_event_settlement(_settlement_id uuid, _snapshot jsonb, _bp_version_id uuid DEFAULT NULL::uuid, _note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.event_settlements; v_c1 numeric; v_c2 numeric; v_bp_event uuid; v_tol numeric := 0.005; v_bench jsonb;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
          OR has_permission(auth.uid(),'manage_bp')) THEN
    RAISE EXCEPTION 'Sem permissão para selar fechamentos';
  END IF;

  SELECT * INTO v_row FROM public.event_settlements WHERE id = _settlement_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Fechamento % não existe', _settlement_id; END IF;
  IF v_row.company_id <> current_company_id() THEN RAISE EXCEPTION 'Fechamento de outra empresa'; END IF;
  IF v_row.is_sealed THEN RAISE EXCEPTION 'Este fechamento já está selado'; END IF;
  IF _snapshot IS NULL THEN RAISE EXCEPTION 'Snapshot do resultado em falta'; END IF;

  v_c1 := COALESCE((_snapshot->>'check1')::numeric, 0);
  v_c2 := COALESCE((_snapshot->>'check2')::numeric, 0);
  IF abs(v_c1) > v_tol OR abs(v_c2) > v_tol THEN
    RAISE EXCEPTION 'Só é possível selar com as verificações a zero (C1=%, C2=%)', v_c1, v_c2;
  END IF;

  IF _bp_version_id IS NOT NULL THEN
    SELECT event_id INTO v_bp_event FROM public.bp_versions WHERE id = _bp_version_id;
    IF v_bp_event IS NULL OR v_bp_event <> v_row.event_id THEN
      RAISE EXCEPTION 'A versão de BP não pertence a este evento';
    END IF;
  END IF;

  PERFORM set_config('app.settlement_seal_op', 'on', true);

  UPDATE public.event_settlements SET
    is_sealed = true,
    sealed_at = now(),
    sealed_by = auth.uid(),
    sealed_bp_version_id = _bp_version_id,
    sealed_snapshot = _snapshot,
    seal_note = _note,
    unsealed_at = NULL, unsealed_by = NULL, unseal_reason = NULL
  WHERE id = _settlement_id;

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, new_data, company_id)
  VALUES ('event_settlements', _settlement_id::text, 'settlement_sealed', COALESCE(auth.uid()::text,'system'),
          jsonb_build_object('bp_version_id', _bp_version_id, 'note', _note, 'check1', v_c1, 'check2', v_c2),
          v_row.company_id);

  IF v_row.parent_id IS NULL THEN
    BEGIN
      v_bench := public.collect_event_benchmarks(v_row.event_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'collect_event_benchmarks falhou para %: %', v_row.event_id, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'settlement_id', _settlement_id, 'bp_version_id', _bp_version_id, 'benchmarks', v_bench);
END $function$;