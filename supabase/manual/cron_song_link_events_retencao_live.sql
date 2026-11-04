-- Classe R2 — PREPARADA, NÃO APLICADA. Instalação só pelo 0, com «Sim» separado.
-- Pré-requisitos: 0331 §1–§3 instalados e backfill provado; DML inicial em lotes com «Corro?».
-- Inventário: docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json,
-- checked_at 2026-10-24T14:08:42Z. Minutos 17 e 53 livres nesse inventário,
-- incluindo */4, */5, */10, */15 e 7-59/15. Janela 04 UTC, fora das 06–09 UTC.
-- Antes de instalar, o 0 reconfirma por SELECT o inventário actual e cron.timezone=UTC:
-- SELECT jobid,jobname,schedule,active FROM cron.job ORDER BY jobid;
-- SELECT current_setting('cron.timezone',true);
-- A chamada repetida de refresh no job de retenção garante a ordem mesmo após falha/atraso do job diário.
-- Crons não entram na migração; este ficheiro não executa o DML inicial na instalação.
SELECT cron.schedule('song-link-ident-daily-refresh', '17 4 * * *', $job$
 SELECT public.song_link_ident_daily_refresh(
   (now() AT TIME ZONE 'Europe/Lisbon')::date-3,
   (now() AT TIME ZONE 'Europe/Lisbon')::date-1);
$job$);

SELECT cron.schedule('song-link-events-retencao', '53 4 * * *', $job$
 DO $run$
 DECLARE v_deadline timestamptz; v_rows bigint;
 BEGIN
  PERFORM public.song_link_ident_daily_refresh(
    (now() AT TIME ZONE 'Europe/Lisbon')::date-3,
    (now() AT TIME ZONE 'Europe/Lisbon')::date-1);
  -- Às 04 UTC Lisboa e São Paulo têm a mesma data; ambos os agregados cobrem hoje-3..hoje-1.
  -- Cada fase inicia lotes por até 90 segundos; o lote já iniciado acaba normalmente.
  v_deadline:=clock_timestamp()+interval '90 seconds';
  LOOP
   v_rows:=public.anonymize_song_link_events(30);
   EXIT WHEN v_rows=0 OR clock_timestamp()>=v_deadline;
  END LOOP;
  v_deadline:=clock_timestamp()+interval '90 seconds';
  LOOP
   v_rows:=public.purge_song_link_events(13);
   EXIT WHEN v_rows=0 OR clock_timestamp()>=v_deadline;
  END LOOP;
 END $run$;
$job$);

-- Reversão manual antes de restaurar as funções anteriores:
-- SELECT cron.unschedule('song-link-ident-daily-refresh');
-- SELECT cron.unschedule('song-link-events-retencao');
