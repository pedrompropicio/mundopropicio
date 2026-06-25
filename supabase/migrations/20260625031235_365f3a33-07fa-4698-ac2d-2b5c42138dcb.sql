
CREATE OR REPLACE FUNCTION crm.tick_leads_capi(p_force boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_campanha_ativa boolean;
  v_srk text;
BEGIN
  -- 1) Campanha ativa?
  SELECT EXISTS (
    SELECT 1 FROM crm.meta_publish_plan
    WHERE activated_at IS NOT NULL
      AND (end_time IS NULL OR end_time > now())
  ) INTO v_campanha_ativa;

  -- 2) Decisão: processa se forçado OU se há campanha ativa
  IF NOT (p_force OR v_campanha_ativa) THEN
    RETURN; -- nada a fazer, sai silenciosamente
  END IF;

  -- 3) Lê service_role key do vault (mesmo mecanismo do cron
  --    crm-google-lead-conversion-enqueue: vault 'email_queue_service_role_key')
  SELECT decrypted_secret INTO v_srk
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  IF v_srk IS NULL THEN
    RAISE WARNING '[tick_leads_capi] vault secret email_queue_service_role_key em falta';
    RETURN;
  END IF;

  -- 4) Dispara a edge function via pg_net (fire-and-forget;
  --    status_code NULL é esperado por causa do timeout de pg_net)
  PERFORM net.http_post(
    url     := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/process-leads-capi',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_srk
               ),
    body    := '{}'::jsonb
  );
END;
$function$;

REVOKE ALL ON FUNCTION crm.tick_leads_capi(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.tick_leads_capi(boolean) TO postgres, service_role;
