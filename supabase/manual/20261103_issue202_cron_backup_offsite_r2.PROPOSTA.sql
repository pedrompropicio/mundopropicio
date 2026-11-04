-- NÃO APLICADA — PROPOSTA #202 E2b; autorização separada pelo PROC-promocao com Sim.
-- Só agendar após primeira cópia completa verificada e promoção autorizada da 0310.
-- Segredos (só nomes): BACKUP_R2_ACCOUNT_ID, BACKUP_R2_ACCESS_KEY_ID,
-- BACKUP_R2_SECRET_ACCESS_KEY, BACKUP_R2_BUCKET, BACKUP_R2_ENC_KEY.
-- A chave de encriptação é guardada fora do Supabase, no 1Password/cofre de infra.
-- O Pedro configura as chaves de acesso só de escrita e o lock/lifecycle no R2 UE.
-- Lifecycle sugerido: daily/ 30 dias; weekly/ 84 dias; monthly/ 365 dias.
-- Não altera daily-database-backup, cleanup-old-backups nem monthly-backup-test.

SELECT cron.schedule('backup-offsite-r2', '*/10 6-9 * * *', $cron$
  SELECT net.http_post(
    url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/database-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
         WHERE name = 'email_queue_service_role_key' LIMIT 1
      )
    ),
    body := '{"target":"offsite"}'::jsonb,
    timeout_milliseconds := 65000
  );
$cron$);
