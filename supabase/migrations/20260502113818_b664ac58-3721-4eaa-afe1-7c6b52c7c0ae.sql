CREATE OR REPLACE FUNCTION public.calibrate_forecast_boost(
  p_event_id uuid,
  p_window_days integer DEFAULT 30
)
RETURNS TABLE (
  event_id uuid,
  event_name text,
  event_date date,
  window_days integer,
  total_qty bigint,
  first_sale_date date,
  last_sale_date date,
  base_window_days integer,
  base_qty bigint,
  base_velocity numeric,
  final_qty bigint,
  final_velocity numeric,
  observed_boost numeric,
  warning text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_event_date date;
  v_event_name text;
  v_first_sale date;
  v_last_sale date;
  v_window int := GREATEST(1, COALESCE(p_window_days, 30));
  v_cutoff date;
  v_total bigint := 0;
  v_base_qty bigint := 0;
  v_final_qty bigint := 0;
  v_base_days int := 0;
  v_base_vel numeric := 0;
  v_final_vel numeric := 0;
  v_boost numeric := NULL;
  v_warn text := NULL;
BEGIN
  SELECT e.date, e.name INTO v_event_date, v_event_name
  FROM public.events e WHERE e.id = p_event_id;

  IF v_event_date IS NULL THEN
    v_warn := 'Evento não tem data definida';
  END IF;

  SELECT MIN(ts.sale_date), MAX(ts.sale_date), COALESCE(SUM(ts.quantity), 0)
    INTO v_first_sale, v_last_sale, v_total
  FROM public.ticket_sales ts
  JOIN public.event_ticket_lots l ON l.id = ts.lot_id
  JOIN public.event_ticket_zones z ON z.id = l.zone_id
  WHERE z.event_id = p_event_id AND ts.sale_date IS NOT NULL;

  IF v_total = 0 THEN
    RETURN QUERY SELECT p_event_id, v_event_name, v_event_date, v_window,
      0::bigint, NULL::date, NULL::date, 0, 0::bigint, 0::numeric,
      0::bigint, 0::numeric, NULL::numeric,
      'Sem vendas datadas para este evento'::text;
    RETURN;
  END IF;

  -- Reta final = últimos v_window dias contados a partir da última venda registada
  -- (ou data do evento, se for anterior à última venda — improvável mas defensivo)
  v_cutoff := COALESCE(v_event_date, v_last_sale) - v_window;

  SELECT COALESCE(SUM(ts.quantity), 0)
    INTO v_final_qty
  FROM public.ticket_sales ts
  JOIN public.event_ticket_lots l ON l.id = ts.lot_id
  JOIN public.event_ticket_zones z ON z.id = l.zone_id
  WHERE z.event_id = p_event_id
    AND ts.sale_date IS NOT NULL
    AND ts.sale_date > v_cutoff;

  SELECT COALESCE(SUM(ts.quantity), 0)
    INTO v_base_qty
  FROM public.ticket_sales ts
  JOIN public.event_ticket_lots l ON l.id = ts.lot_id
  JOIN public.event_ticket_zones z ON z.id = l.zone_id
  WHERE z.event_id = p_event_id
    AND ts.sale_date IS NOT NULL
    AND ts.sale_date <= v_cutoff;

  v_base_days := GREATEST(1, (v_cutoff - v_first_sale)::int);
  v_final_vel := v_final_qty::numeric / v_window::numeric;
  v_base_vel  := v_base_qty::numeric  / v_base_days::numeric;

  IF v_base_vel > 0 THEN
    v_boost := ROUND(v_final_vel / v_base_vel, 3);
  ELSE
    v_warn := COALESCE(v_warn || ' · ', '') || 'Sem vendas antes da reta final — boost indeterminado';
  END IF;

  IF v_first_sale > COALESCE(v_event_date, v_last_sale) - v_window THEN
    v_warn := COALESCE(v_warn || ' · ', '')
           || 'Janela de venda mais curta que a reta final — boost pouco fiável';
  END IF;

  RETURN QUERY SELECT
    p_event_id, v_event_name, v_event_date, v_window,
    v_total, v_first_sale, v_last_sale,
    v_base_days, v_base_qty, ROUND(v_base_vel, 3),
    v_final_qty, ROUND(v_final_vel, 3),
    v_boost, v_warn;
END;
$$;

COMMENT ON FUNCTION public.calibrate_forecast_boost(uuid, integer) IS
'Calcula o multiplicador de aceleração observado na reta final (últimos N dias) vs ritmo base, a partir das vendas reais de um evento de referência. Usado para calibrar forecast_final_accel no Simulador.';

GRANT EXECUTE ON FUNCTION public.calibrate_forecast_boost(uuid, integer) TO authenticated;