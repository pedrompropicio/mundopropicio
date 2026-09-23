CREATE OR REPLACE FUNCTION public.get_event_zone_price_dynamics(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_exists boolean := false;
  v_result jsonb;
BEGIN
  SELECT e.company_id, true INTO v_company, v_exists
    FROM public.events e WHERE e.id = p_event_id;

  IF NOT COALESCE(v_exists, false) THEN
    RAISE EXCEPTION 'evento inexistente';
  END IF;

  IF NOT public.row_belongs_to_current_company(v_company) THEN
    RAISE EXCEPTION 'sem acesso a este evento';
  END IF;

  WITH z AS (
    SELECT id, name FROM public.event_ticket_zones WHERE event_id = p_event_id
  ),
  daily AS (
    SELECT z.id AS zone_id,
           z.name AS zone_name,
           ts.sale_date,
           SUM(ts.quantity)::numeric AS qty,
           SUM(COALESCE(ts.total_value, ts.quantity * ts.unit_price, 0))::numeric AS value,
           (ARRAY_AGG(ts.unit_price ORDER BY ts.created_at DESC NULLS LAST, ts.id DESC))[1]::numeric AS price
      FROM public.ticket_sales ts
      JOIN z ON z.id = ts.zone_id
     GROUP BY 1, 2, 3
  ),
  seq AS (
    SELECT d.*, LAG(d.price) OVER (PARTITION BY d.zone_id ORDER BY d.sale_date) AS prev_price
      FROM daily d
  ),
  viradas AS (
    SELECT zone_id, zone_name, sale_date, prev_price AS preco_antigo, price AS preco_novo
      FROM seq
     WHERE prev_price IS NOT NULL AND price IS NOT NULL AND prev_price <> price
  ),
  cap_all AS (
    SELECT zone_label, capacity, observed_on,
           ROW_NUMBER() OVER (PARTITION BY zone_label ORDER BY observed_on DESC) AS rn
      FROM public.event_zone_capacities
     WHERE event_id = p_event_id AND capacity_kind = 'released'
  ),
  cap AS (
    SELECT zone_label, capacity, observed_on FROM cap_all WHERE rn = 1
  ),
  capn AS (
    SELECT public.normalize_zone_label(zone_label) AS k,
           SUM(capacity)::numeric AS capacity,
           MAX(observed_on) AS observed_on
      FROM cap
     GROUP BY 1
  ),
  zsum AS (
    SELECT d.zone_id, d.zone_name,
           SUM(d.qty) AS qty,
           SUM(d.value) AS value,
           MAX(d.sale_date) AS last_sale,
           MIN(d.sale_date) AS first_sale,
           (ARRAY_AGG(d.price ORDER BY d.sale_date DESC))[1] AS preco_vigor
      FROM daily d
     GROUP BY 1, 2
  ),
  zc AS (
    SELECT zs.*,
           COALESCE(ce.capacity::numeric, cn.capacity) AS released,
           COALESCE(ce.observed_on, cn.observed_on) AS released_on,
           CASE WHEN ce.capacity IS NOT NULL THEN 'exacta'
                WHEN cn.capacity IS NOT NULL THEN 'normalizada' END AS released_fonte
      FROM zsum zs
      LEFT JOIN cap ce ON ce.zone_label = zs.zone_name
      LEFT JOIN capn cn ON cn.k = public.normalize_zone_label(zs.zone_name)
  )
  SELECT jsonb_build_object(
    'event_id', p_event_id,
    'zonas', COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'zone_id', zc.zone_id,
         'zone_name', zc.zone_name,
         'preco_vigor', zc.preco_vigor,
         'qty', zc.qty,
         'value', zc.value,
         'released', zc.released,
         'released_on', zc.released_on,
         'released_fonte', zc.released_fonte,
         'ocupacao_pct', CASE WHEN zc.released IS NOT NULL AND zc.released > 0
                              THEN round(zc.qty / zc.released * 100, 1) END,
         'viradas', (SELECT COUNT(*) FROM viradas v WHERE v.zone_id = zc.zone_id),
         'first_sale', zc.first_sale,
         'last_sale', zc.last_sale
       ) ORDER BY zc.value DESC NULLS LAST) FROM zc), '[]'::jsonb),
    'series', COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'zone_id', d.zone_id, 'sale_date', d.sale_date, 'qty', d.qty, 'value', d.value, 'price', d.price
       ) ORDER BY d.sale_date, d.zone_id) FROM daily d), '[]'::jsonb),
    'viradas', COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'zone_id', v.zone_id, 'zone_name', v.zone_name, 'sale_date', v.sale_date,
         'preco_antigo', v.preco_antigo, 'preco_novo', v.preco_novo
       ) ORDER BY v.sale_date, v.zone_name) FROM viradas v), '[]'::jsonb),
    'totais', jsonb_build_object(
         'qty', COALESCE((SELECT SUM(qty) FROM zsum), 0),
         'value', COALESCE((SELECT SUM(value) FROM zsum), 0),
         'zonas', (SELECT COUNT(*) FROM zsum),
         'dias_distintos', (SELECT COUNT(DISTINCT sale_date) FROM daily),
         'ultima_sale_date', (SELECT MAX(last_sale) FROM zsum)
    )
  ) INTO v_result;

  SELECT v_result || jsonb_build_object('espelho', jsonb_build_object(
           'qty', COALESCE(SUM(s.qty), 0),
           'value', COALESCE(SUM(s.value), 0),
           'dias', COUNT(DISTINCT s.sale_date),
           'ultima_sale_date', MAX(s.sale_date),
           'providers', COALESCE(
             (SELECT jsonb_agg(DISTINCT x.provider) FROM (
                SELECT s2.provider
                  FROM public.get_daily_sales_series('2000-01-01'::date, (CURRENT_DATE + 3650), ARRAY[p_event_id]::uuid[], NULL) s2
                 WHERE s2.event_id = p_event_id
             ) x), '[]'::jsonb)
         ))
    INTO v_result
    FROM public.get_daily_sales_series('2000-01-01'::date, (CURRENT_DATE + 3650), ARRAY[p_event_id]::uuid[], NULL) s
   WHERE s.event_id = p_event_id;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_event_zone_price_dynamics(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_event_zone_price_dynamics(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_event_zone_price_dynamics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_zone_price_dynamics(uuid) TO service_role;