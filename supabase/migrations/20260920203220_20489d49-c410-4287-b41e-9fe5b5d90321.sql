CREATE OR REPLACE FUNCTION public.anonymize_traffic_events(_days integer DEFAULT 180)
 RETURNS TABLE(leads_anonymized bigint, gclicks_anonymized bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm', 'pg_catalog'
AS $function$
DECLARE
  v_role text := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  v_cutoff timestamptz;
  v_leads bigint := 0;
  v_clicks bigint := 0;
BEGIN
  -- #75: só service_role (cron/edge) ou sessão sem claims (postgres/migração).
  IF v_role NOT IN ('service_role', '') THEN
    RAISE EXCEPTION 'Apenas service_role pode anonimizar eventos de tráfego.' USING ERRCODE = '42501';
  END IF;

  v_cutoff := now() - make_interval(days => GREATEST(COALESCE(_days, 180), 0));

  WITH upd AS (
    UPDATE public.leads
       SET ip_inet = NULL, user_agent = NULL, fbc = NULL, fbp = NULL, mp_click_id = NULL
     WHERE kind = 'redirect_click'
       AND created_at < v_cutoff
       AND (ip_inet IS NOT NULL OR user_agent IS NOT NULL OR fbc IS NOT NULL
            OR fbp IS NOT NULL OR mp_click_id IS NOT NULL)
    RETURNING 1
  ) SELECT count(*) INTO v_leads FROM upd;

  WITH upd AS (
    UPDATE crm.google_click
       SET gclid = NULL, gbraid = NULL, wbraid = NULL, user_agent = NULL
     WHERE created_at < v_cutoff
       AND (gclid IS NOT NULL OR gbraid IS NOT NULL OR wbraid IS NOT NULL OR user_agent IS NOT NULL)
    RETURNING 1
  ) SELECT count(*) INTO v_clicks FROM upd;

  RETURN QUERY SELECT v_leads, v_clicks;
END;
$function$;

REVOKE ALL ON FUNCTION public.anonymize_traffic_events(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anonymize_traffic_events(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_traffic_events(integer) TO service_role;

SELECT cron.unschedule('traffic-events-anonymize')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'traffic-events-anonymize');

SELECT cron.schedule('traffic-events-anonymize', '40 3 * * *',
  $$SELECT public.anonymize_traffic_events(180);$$);