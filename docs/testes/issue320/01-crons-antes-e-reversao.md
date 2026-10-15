# Issue #320 — configuração dos crons ANTES da suspensão (2026-10-15 ~21:50 UTC)
Fonte: select jobid,jobname,schedule,active,command from cron.job (Live)

```
33 | portal-process-lead-capture | */5 * * * * | active=true | SELECT public.portal_tick_lead_capture();
34 | portal-process-redirect-log | * * * * *   | active=true | SELECT public.portal_tick_redirect_log();
44 | leads-capi-5min             | */5 * * * * | active=true | SELECT crm.tick_leads_capi(false);
45 | leads-capi-daily            | 0 6 * * *   | active=true | SELECT crm.tick_leads_capi(true);
```
Não tocados: 42 crm-google-lead-conversion-enqueue (Google, comando com credencial), 92 leads-capi-health (só leitura), 2068, 2256.

## Reversão (manual, NÃO automática — só por ordem do Pedro)
```
SELECT cron.schedule('portal-process-lead-capture','*/5 * * * *',$$SELECT public.portal_tick_lead_capture();$$);
SELECT cron.schedule('portal-process-redirect-log','* * * * *',$$SELECT public.portal_tick_redirect_log();$$);
SELECT cron.schedule('leads-capi-5min','*/5 * * * *',$$SELECT crm.tick_leads_capi(false);$$);
SELECT cron.schedule('leads-capi-daily','0 6 * * *',$$SELECT crm.tick_leads_capi(true);$$);
```
Além dos crons, retomar exige desligar o interruptor public.capi_dispatch_control (ver feature doc).
