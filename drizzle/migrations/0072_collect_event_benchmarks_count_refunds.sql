-- #89: a curva conta devoluções (quantidades negativas), como o total de bilhetes do evento.
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

  DELETE FROM public.event_simulator_sales_curve_buckets WHERE event_id = _event_id;
  SELECT COALESCE(sum(ts.quantity),0) INTO v_total
    FROM public.ticket_sales ts JOIN public.event_ticket_zones z ON z.id = ts.zone_id
   WHERE z.event_id = _event_id;
  IF v_total > 0 THEN
    INSERT INTO public.event_simulator_sales_curve_buckets (event_id, days_before, cumulative_pct)
    SELECT _event_id, d.db,
           round(100.0 * COALESCE((SELECT sum(ts.quantity)
              FROM public.ticket_sales ts JOIN public.event_ticket_zones z ON z.id = ts.zone_id
             WHERE z.event_id = _event_id
               AND (v_ev.date - COALESCE(ts.sale_date_to, ts.sale_date)) >= d.db), 0) / v_total, 4)
      FROM generate_series(0,180) AS d(db);
    GET DIAGNOSTICS v_buckets = ROW_COUNT;
  END IF;

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