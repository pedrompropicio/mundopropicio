CREATE OR REPLACE FUNCTION crm.tick_leads_capi(p_force boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_srk text;
BEGIN
  -- NOTA: guarda de "campanha ativa" REMOVIDA (decisão 2026-06-28, Pedro).
  -- A audiência de site cresce sempre que há leads novos, haja ou não
  -- campanha ativa. p_force mantido por compatibilidade com os crons
  -- existentes (44/45) mas já não tem efeito prático — processamos sempre.

  -- 1) Lê service_role key do vault (mesmo mecanismo do cron
  --    crm-google-lead-conversion-enqueue: vault 'email_queue_service_role_key')
  SELECT decrypted_secret INTO v_srk
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  IF v_srk IS NULL THEN
    RAISE WARNING '[tick_leads_capi] vault secret email_queue_service_role_key em falta';
    RETURN;
  END IF;

  -- 2) Dispara a edge function via pg_net (fire-and-forget;
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