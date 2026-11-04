-- 0328 — #202 E2b: exclusões do backup e retenção em lotes.
-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Autorização Pedro 6621085645; decisão 6633703391 (04/11/2026).
-- Correcção 6634413910 (#647): song_link_report_visitor_* ficam no backup diário.
-- Ordem: depois de um global ok com o 202-d; depois a 0310 e a cópia offsite, pelo 0.
-- A referência 7 pressupõe o DML Live de 04/11 (#333/#335, 6631900441), ausente do repo.
-- song_link_events e tabelas pequenas do Song Link ficam no backup; sem purga de eventos.
-- Restauro: song_link_report_* vêm do backup, sem reconstrução a partir de eventos anonimizados.
-- ip_city_ranges é recarregada pelo cron carreira-dbip-city-mensal; não tem purga aqui.
-- Cache: 72 h segundo #647, ponto 4; passagem da chave a hash fica para a #647.
-- Crons separados: supabase/manual/cron_song_link_retention_live.sql
-- Rollback: supabase/manual/rollback_0328_issue202_backup_exclusoes_retencao_comentado.sql

BEGIN;

-- §1 — motivos literais da decisão do Pedro; preservar exclusões existentes.
INSERT INTO public.backup_excluded_tables (schema_name, table_name, reason)
VALUES
  ('public', 'song_link_diag', 'telemetria'),
  ('public', 'ip_city_ranges', 'DB-IP, recarregada todos os meses pelo cron carreira-dbip-city-mensal'),
  ('public', 'song_link_delivery_slots', 'controlo de entrega'),
  ('public', 'ip_geo_cache', 'cache')
ON CONFLICT (schema_name, table_name) DO NOTHING;

-- §2 — falhar atomicamente perante deriva ou segunda aplicação integral.
DO $guard$
DECLARE
  n integer;
BEGIN
  UPDATE public.system_invariants SET reference_count = 11
   WHERE name = 'backup_tabelas_excluidas' AND reference_count = 7;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION '0328: conferir o reference_count de backup_tabelas_excluidas em Live; esperado 7 antes de aplicar.';
  END IF;
END;
$guard$;

-- §3 — uma chamada apaga no máximo p_batch linhas; sem ciclos na transação.
CREATE OR REPLACE FUNCTION public.purge_song_link_diag(
  p_days integer DEFAULT 14, p_batch integer DEFAULT 50000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  n integer;
BEGIN
  IF p_days IS NULL OR p_days < 7 THEN
    RAISE EXCEPTION 'Retenção mínima de 7 dias.';
  END IF;
  IF p_batch IS NULL OR p_batch < 1 THEN
    RAISE EXCEPTION 'p_batch deve ser um inteiro positivo.';
  END IF;
  DELETE FROM public.song_link_diag
   WHERE ctid IN (
     SELECT ctid FROM public.song_link_diag
      WHERE created_at < now() - make_interval(days => p_days)
      ORDER BY created_at
      LIMIT p_batch
   );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;
REVOKE ALL ON FUNCTION public.purge_song_link_diag(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_song_link_diag(integer, integer) TO service_role;
COMMENT ON FUNCTION public.purge_song_link_diag(integer, integer) IS
  '#202: purga em lote de telemetria por created_at; 14 dias por omissão, mínimo 7; só service_role.';

CREATE OR REPLACE FUNCTION public.purge_song_link_delivery_slots(
  p_days integer DEFAULT 30, p_batch integer DEFAULT 50000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  n integer;
BEGIN
  IF p_days IS NULL OR p_days < 14 THEN
    RAISE EXCEPTION 'Retenção mínima de 14 dias.';
  END IF;
  IF p_batch IS NULL OR p_batch < 1 THEN
    RAISE EXCEPTION 'p_batch deve ser um inteiro positivo.';
  END IF;
  DELETE FROM public.song_link_delivery_slots
   WHERE ctid IN (
     SELECT ctid FROM public.song_link_delivery_slots
      WHERE delivered_at IS NOT NULL
        AND delivered_at < now() - make_interval(days => p_days)
      ORDER BY delivered_at
      LIMIT p_batch
   );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;
REVOKE ALL ON FUNCTION public.purge_song_link_delivery_slots(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_song_link_delivery_slots(integer, integer) TO service_role;
COMMENT ON FUNCTION public.purge_song_link_delivery_slots(integer, integer) IS
  '#202: purga em lote 30 dias após delivered_at, mínimo 14; delivered_at NULL fica sempre; só service_role.';

CREATE OR REPLACE FUNCTION public.purge_ip_geo_cache(
  p_hours integer DEFAULT 72, p_batch integer DEFAULT 50000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  n integer;
BEGIN
  IF p_hours IS NULL OR p_hours < 24 THEN
    RAISE EXCEPTION 'Retenção mínima de 24 horas.';
  END IF;
  IF p_batch IS NULL OR p_batch < 1 THEN
    RAISE EXCEPTION 'p_batch deve ser um inteiro positivo.';
  END IF;
  DELETE FROM public.ip_geo_cache
   WHERE ctid IN (
     SELECT ctid FROM public.ip_geo_cache
      WHERE resolved_at < now() - make_interval(hours => p_hours)
      ORDER BY resolved_at
      LIMIT p_batch
   );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;
REVOKE ALL ON FUNCTION public.purge_ip_geo_cache(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_ip_geo_cache(integer, integer) TO service_role;
COMMENT ON FUNCTION public.purge_ip_geo_cache(integer, integer) IS
  '#202/#647: cache com IP em claro; purga em lote 72 horas após resolved_at, mínimo 24 h; só service_role.';

COMMIT;
