
-- Limiares e regras visíveis: os de antes do 1.º cutover de cada site (registo em club_points_cutover_log).
UPDATE public.club_levels l SET min_points = (x.levels_before->>l.name)::int
  FROM (SELECT DISTINCT ON (site_id) site_id, levels_before FROM public.club_points_cutover_log ORDER BY site_id, done_at) x
 WHERE l.site_id = x.site_id AND x.levels_before ? l.name;
UPDATE public.club_point_rules r SET points = (x.rules_before->r.rule_key->>'points')::int
  FROM (SELECT DISTINCT ON (site_id) site_id, rules_before FROM public.club_points_cutover_log ORDER BY site_id, done_at) x
 WHERE r.site_id = x.site_id AND x.rules_before ? r.rule_key
   AND r.rule_key IN ('join_confirmed','friend_joined','crew_complete','promo_lot_purchase');
-- Prova de compatibilidade: com a fórmula antiga (pontos + limiares repostos) ninguém fica abaixo do nível canónico anterior.
DO $rb$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM _rb327_lv b
    JOIN public.club_levels lb ON lb.site_id = b.site_id AND lb.name = b.level_name
   WHERE coalesce((SELECT max(l.min_points) FROM public.club_levels l WHERE l.site_id = b.site_id
                    AND l.min_points <= (SELECT coalesce(sum(points),0) FROM public.club_points WHERE member_id = b.id)), -1) < lb.min_points;
  IF n > 0 AND coalesce(current_setting('club327.rollback_allow_level_drop', true), '') <> 'on' THEN
    RAISE EXCEPTION 'rollback #327: % membro(s) desceriam de nível; abortado (nada mudou)', n; END IF;
END $rb$;
DO $rb$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['club_points_config','club_level_floors','club_points_cutover_log','club_legacy_consumption','club_referral_events','club_purchase_evidence'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t||'_c327', t);
  END LOOP;
END $rb$;
DROP FUNCTION IF EXISTS public.club_points_cutover(uuid, jsonb);
DROP FUNCTION IF EXISTS public.club_referral_progress(uuid);
DROP FUNCTION IF EXISTS public.club_rules_public(uuid);
DROP FUNCTION IF EXISTS public.club_member_level(uuid);
DROP FUNCTION IF EXISTS public.club_purchase_revoke(uuid, text, text);
DROP FUNCTION IF EXISTS public.club_award_purchase(uuid);
DROP FUNCTION IF EXISTS public._club_award_core(uuid, text, text, int, uuid);
DROP FUNCTION IF EXISTS public._club_rule_used(uuid, text, uuid);
DROP FUNCTION IF EXISTS public._club_active_cfg(uuid);
DROP FUNCTION IF EXISTS public._club_site_lock(uuid, boolean);
DROP FUNCTION IF EXISTS public._club327_cohesion();
UPDATE public.club_points_config SET status = 'retired' WHERE status <> 'retired';
COMMENT ON TABLE public.club_points_config IS 'DEPRECATED (#327 revertido): sem efeito no motor.';
COMMENT ON TABLE public.club_level_floors IS 'DEPRECATED (#327 revertido): pisos guardados só como histórico.';
COMMENT ON TABLE public.club_legacy_consumption IS 'DEPRECATED (#327 revertido): retrato guardado só como histórico.';
COMMENT ON TABLE public.club_referral_events IS 'DEPRECATED (#327 revertido): contagens guardadas só como histórico.';
COMMENT ON TABLE public.club_purchase_evidence IS 'DEPRECATED (#327 revertido): provas guardadas só como histórico.';
COMMENT ON COLUMN public.club_points.event_id IS 'DEPRECATED (#327 revertido): edição gravada nos créditos criados enquanto ativo.';
COMMIT;
