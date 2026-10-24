-- Rollback do lembrete Newgang (só objetos criados por 20261024_newgang_club_reminder.sql). Requer Sim do Pedro.
-- Atenção: apaga o registo de quem já recebeu o lembrete; exportar antes (SELECT member_id,status FROM club_reminder_reservations).
DROP FUNCTION IF EXISTS public.club_reminder_summary(uuid,uuid);
DROP FUNCTION IF EXISTS public.club_reminder_candidates(uuid,uuid,integer);
DROP FUNCTION IF EXISTS public.club_reminder_mark(uuid,text,text);
DROP FUNCTION IF EXISTS public.club_reminder_reserve(uuid,uuid,uuid,text,boolean);
DROP FUNCTION IF EXISTS public._club_reminder_reason(uuid,uuid,uuid,boolean);
DROP TABLE IF EXISTS public.club_reminder_reservations;
