-- Portal MP CRM — Sprint 2: cron jobs (1 min) para os processadores de portal.
-- ============================================================================
-- ATENÇÃO: vive em supabase/manual/ (NÃO em supabase/migrations/) de propósito,
-- para o Lovable não o auto-aplicar no push. Executar MANUALMENTE no SQL Editor
-- do Lovable Cloud (Live ukpuhoynrqobqtzdbysp), substituindo %SERVICE_ROLE_KEY%
-- pela service_role key real ANTES de correr. Enquanto o placeholder não for
-- substituído, este ficheiro é deliberadamente NÃO-executável.
-- ============================================================================
-- Requer extensões: pg_cron + pg_net (já presentes no projeto, usadas por
-- outros crons meta-sync). Schedule '* * * * *' = a cada minuto.

-- 1) process-lead-capture ----------------------------------------------------
do $$
begin
  perform cron.unschedule('portal-process-lead-capture');
exception when others then
  null; -- job ainda não existe na 1ª execução
end $$;

select cron.schedule(
  'portal-process-lead-capture',
  '* * * * *',
  $cron$
  select net.http_post(
    url     := 'https://ukpuhoynrqobqtzdbysp.supabase.co/functions/v1/process-lead-capture',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer %SERVICE_ROLE_KEY%'
               ),
    body    := '{}'::jsonb
  );
  $cron$
);

-- 2) process-redirect-log ----------------------------------------------------
do $$
begin
  perform cron.unschedule('portal-process-redirect-log');
exception when others then
  null;
end $$;

select cron.schedule(
  'portal-process-redirect-log',
  '* * * * *',
  $cron$
  select net.http_post(
    url     := 'https://ukpuhoynrqobqtzdbysp.supabase.co/functions/v1/process-redirect-log',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer %SERVICE_ROLE_KEY%'
               ),
    body    := '{}'::jsonb
  );
  $cron$
);

-- Verificação (correr à parte para confirmar):
--   select jobname, schedule, active from cron.job
--   where jobname like 'portal-%' order by jobname;
