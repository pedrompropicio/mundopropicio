-- 1) phone column on profiles (para WhatsApp)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

-- 2) função SECDEF que percorre chamados e escala
CREATE OR REPLACE FUNCTION public.run_operacao_sla_escalator()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supabase_url text := 'https://ukpuhoynrqobqtzdbysp.supabase.co';
  v_service_role text;
  r record;
  v_processed int := 0;
  v_frente record;
BEGIN
  SELECT decrypted_secret INTO v_service_role
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  IF v_service_role IS NULL THEN
    RAISE WARNING 'run_operacao_sla_escalator: service_role secret missing';
    RETURN jsonb_build_object('error','service_role_missing');
  END IF;

  -- NÍVEL 1: half-time atingido, ainda não ack, status open
  FOR r IN
    SELECT id, frente_id, company_id, priority, text, etapa_id
      FROM public.operacao_registros
     WHERE kind='chamado'
       AND status='open'
       AND acked_at IS NULL
       AND escalation_level = 0
       AND sla_half_at IS NOT NULL
       AND sla_half_at <= now()
  LOOP
    UPDATE public.operacao_registros SET escalation_level = 1 WHERE id = r.id;
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || v_service_role
      ),
      body := jsonb_build_object(
        'target', jsonb_build_object('type','frente_team','frente_id', r.frente_id),
        'title', 'Chamado sem resposta',
        'body', COALESCE(NULLIF(r.text,''),'Chamado aberto') || ' (50% SLA)',
        'url', '/operacao/chamado/' || r.id::text,
        'whatsapp', false,
        'tag', 'op-sla1-' || r.id::text
      )
    );
    v_processed := v_processed + 1;
  END LOOP;

  -- NÍVEL 2: SLA total atingido, ainda não resolvido, escalation < 2
  FOR r IN
    SELECT id, frente_id, company_id, priority, text
      FROM public.operacao_registros
     WHERE kind='chamado'
       AND status IN ('open','in_progress')
       AND escalation_level < 2
       AND sla_due_at IS NOT NULL
       AND sla_due_at <= now()
  LOOP
    UPDATE public.operacao_registros SET escalation_level = 2 WHERE id = r.id;
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || v_service_role
      ),
      body := jsonb_build_object(
        'target', jsonb_build_object('type','company_admins','company_id', r.company_id),
        'title', '🚨 SLA vencido — chamado',
        'body', COALESCE(NULLIF(r.text,''),'Chamado vencido') || ' (' || COALESCE(r.priority,'') || ')',
        'url', '/operacao/chamado/' || r.id::text,
        'whatsapp', COALESCE(r.priority IN ('crit','high'), false),
        'tag', 'op-sla2-' || r.id::text
      )
    );
    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('processed', v_processed, 'ts', now());
END;
$$;

-- 3) Cron 2/min
DO $$ BEGIN PERFORM cron.unschedule('operacao-sla-escalator'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'operacao-sla-escalator',
  '*/2 * * * *',
  $cron$ SELECT public.run_operacao_sla_escalator(); $cron$
);