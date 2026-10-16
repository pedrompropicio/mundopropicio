
DROP FUNCTION IF EXISTS public.club_points_cutover(uuid, jsonb);
DROP FUNCTION IF EXISTS public.club_referral_progress(uuid);
DROP FUNCTION IF EXISTS public.club_member_level(uuid);
DROP FUNCTION IF EXISTS public.club_purchase_revoke(uuid, text, text);
DROP FUNCTION IF EXISTS public.club_award_purchase(uuid);
DROP FUNCTION IF EXISTS public._club_award_core(uuid, text, text, int, uuid);
DROP FUNCTION IF EXISTS public._club_rule_used(uuid, text, uuid, boolean);
DROP FUNCTION IF EXISTS public._club_active_cfg(uuid);
-- Limiares de nível: os de antes do 1.º cutover de cada site (registo em club_points_cutover_log).
UPDATE public.club_levels l SET min_points = (x.levels_before->>l.name)::int
  FROM (SELECT DISTINCT ON (site_id) site_id, levels_before FROM public.club_points_cutover_log ORDER BY site_id, done_at) x
 WHERE l.site_id = x.site_id AND x.levels_before ? l.name;
UPDATE public.club_points_config SET status = 'retired' WHERE status <> 'retired';
COMMENT ON TABLE public.club_points_config IS 'DEPRECATED (#327 revertido): sem efeito no motor.';
COMMENT ON TABLE public.club_level_floors IS 'DEPRECATED (#327 revertido): pisos guardados só como histórico.';
COMMENT ON TABLE public.club_referral_events IS 'DEPRECATED (#327 revertido): contagens guardadas só como histórico.';
COMMENT ON TABLE public.club_purchase_evidence IS 'DEPRECATED (#327 revertido): provas guardadas só como histórico.';
COMMENT ON COLUMN public.club_points.event_id IS 'DEPRECATED (#327 revertido): edição gravada nos créditos criados enquanto ativo.';
