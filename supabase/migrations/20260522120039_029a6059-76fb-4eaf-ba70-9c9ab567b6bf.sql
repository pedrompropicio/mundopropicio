
INSERT INTO public.notification_templates
  (template_name, meta_template_name, language_code, category, body_text, param_count, param_schema, description, status)
VALUES
('equipe_atribuicao_evento','equipe_atribuicao_evento','pt_PT','UTILITY',
 'Olá {{1}}, você foi atribuído como {{2}} do evento {{3}}. Fase atual: {{4}}. Acesse o sistema para detalhes.',4,
 '[{"position":1,"name":"user_name","description":"Nome do usuário"},{"position":2,"name":"role_label","description":"Diretor / Produtor Geral"},{"position":3,"name":"event_name","description":"Nome do evento"},{"position":4,"name":"phase_label","description":"SETUP/Planeamento/Montagem/Evento/Pós"}]'::jsonb,
 'Disparado ao adicionar usuário em event_team_members','pending'),
('lead_atribuido_zona_servico','lead_atribuido_zona_servico','pt_PT','UTILITY',
 'Olá {{1}}, você é o responsável pela {{2}} {{3}} no evento {{4}}.',4,
 '[{"position":1,"name":"user_name","description":"Nome do usuário"},{"position":2,"name":"frente_type","description":"Zona/Serviço"},{"position":3,"name":"frente_name","description":"Nome da frente"},{"position":4,"name":"event_name","description":"Nome do evento"}]'::jsonb,
 'Disparado ao definir current_lead_id em operacao_frentes','pending'),
('etapa_status_alterado','etapa_status_alterado','pt_PT','UTILITY',
 'Etapa {{1}} da {{2}} {{3}} mudou para: {{4}}.',4,
 '[{"position":1,"name":"etapa_name","description":"Nome da etapa"},{"position":2,"name":"frente_type","description":"Zona/Serviço"},{"position":3,"name":"frente_name","description":"Nome da frente"},{"position":4,"name":"new_status","description":"Novo status da etapa"}]'::jsonb,
 'Disparado em UPDATE de operacao_etapas.status','pending'),
('fase_evento_avancou','fase_evento_avancou','pt_PT','UTILITY',
 'Evento {{1}} avançou para fase {{2}}. Verifique pendências.',2,
 '[{"position":1,"name":"event_name","description":"Nome do evento"},{"position":2,"name":"new_phase","description":"Nova fase (Planeamento/Montagem/Evento/Pós)"}]'::jsonb,
 'Disparado em UPDATE de events.operacao_mode','pending')
ON CONFLICT (template_name) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp_dispatcher_minute') THEN
    PERFORM cron.unschedule('whatsapp_dispatcher_minute');
  END IF;
END $$;

SELECT cron.schedule(
  'whatsapp_dispatcher_minute',
  '* * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://ukpuhoynrqobqtzdbysp.supabase.co/functions/v1/whatsapp-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
