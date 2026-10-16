-- #327 — REVERSÃO (ficheiro inerte, NÃO APLICADA). Gerada das funções do baseline local, cujo md5 = Live pós-0176.
-- Repõe as 5 funções alteradas verbatim, remove as funções novas, repõe limiares e as 4 regras visíveis de antes do
-- 1.º cutover e retira configs. NÃO apaga créditos, pisos, provas, contagens nem colunas (ficam DEPRECATED).
-- ORDEM SEGURA (rev3): 1) API compatível já deployada (usa club_member_level enquanto existir; só cai para a fórmula
--    antiga se a RPC estiver AUSENTE — PGRST202/42883, nunca em erros genéricos); 2) correr este ficheiro; 3) API antiga é opcional.
--    Não depende de pausar o cron Wallet: antes do COMMIT a RPC serve o canónico; depois do COMMIT a fórmula antiga com os
--    limiares repostos nunca fica abaixo do canónico (guarda abaixo). A ordem inversa (API antiga primeiro) rebaixa — proibida.
-- Uma transação; aborta (nada muda) se o patch não estiver aplicado ou se algum membro descesse de nível.
BEGIN;
DO $rb$ BEGIN
  IF to_regprocedure('public.club_member_level(uuid)') IS NULL OR to_regprocedure('public._club_award_core(uuid,text,text,integer,uuid)') IS NULL THEN
    RAISE EXCEPTION 'rollback #327: o patch não está aplicado (funções novas ausentes)'; END IF;
END $rb$;
-- Retrato do nível canónico ANTES de reverter (para provar que ninguém desce).
CREATE TEMP TABLE _rb327_lv ON COMMIT DROP AS
  SELECT m.id, m.site_id, x.level_name FROM public.club_members m CROSS JOIN LATERAL public.club_member_level(m.id) x;
CREATE OR REPLACE FUNCTION public.club_award(p_member uuid, p_rule text, p_ref text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE m record; pts int; n int; BEGIN
  SELECT * INTO m FROM club_members WHERE id = p_member; IF NOT FOUND THEN RETURN 0; END IF;
  SELECT points INTO pts FROM club_point_rules WHERE site_id = m.site_id AND rule_key = p_rule AND active;
  IF pts IS NULL THEN RETURN 0; END IF;
  INSERT INTO club_points(company_id, member_id, rule_key, points, ref_id)
    VALUES (m.company_id, p_member, p_rule, pts, p_ref) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN CASE WHEN n > 0 THEN pts ELSE 0 END;
END $function$
;
CREATE OR REPLACE FUNCTION public.club_award_fixed(p_member uuid, p_rule text, p_ref text, p_points integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE m record; n int; BEGIN
  IF coalesce(p_points,0) <= 0 THEN RETURN 0; END IF;
  SELECT * INTO m FROM club_members WHERE id = p_member; IF NOT FOUND THEN RETURN 0; END IF;
  INSERT INTO club_points(company_id, member_id, rule_key, points, ref_id)
    VALUES (m.company_id, p_member, p_rule, p_points, p_ref) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN CASE WHEN n > 0 THEN p_points ELSE 0 END;
END $function$
;
CREATE OR REPLACE FUNCTION public.club_confirm_member(p_member uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE m record; j jsonb; st text; BEGIN
  UPDATE club_members SET confirmed_at = coalesce(confirmed_at, now()), updated_at = now() WHERE id = p_member RETURNING * INTO m;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM club_award(p_member, 'join_confirmed', p_member::text);
  IF m.referred_by_member_id IS NOT NULL AND m.referred_by_member_id <> p_member THEN
    PERFORM club_award(m.referred_by_member_id, 'friend_joined', p_member::text);
  END IF;
  -- #328: uma única tentativa; falha fica recuperável (código preservado + estado), sem novas tentativas automáticas.
  IF m.pending_crew_code IS NOT NULL AND m.pending_crew_status IS NULL THEN
    BEGIN
      j := club_crew_join(p_member, m.pending_crew_code);
      st := j->>'error';
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'club_confirm_member crew: %', SQLERRM; st := 'error'; END;
    IF st IS NULL OR st = 'already_in_crew' THEN
      UPDATE club_members SET pending_crew_code = NULL, pending_crew_status = NULL, pending_crew_checked_at = NULL WHERE id = p_member;
    ELSE
      UPDATE club_members SET pending_crew_status = CASE WHEN st IN ('crew_full','crew_not_found') THEN st ELSE 'error' END,
        pending_crew_checked_at = now() WHERE id = p_member;
    END IF;
  END IF;
END $function$
;
CREATE OR REPLACE FUNCTION public.club_crew_pending(p_member uuid, p_action text DEFAULT 'status'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE m record; j jsonb; st text; nm text; in_same boolean; in_any boolean; BEGIN
  IF p_action IS NULL OR p_action NOT IN ('status','retry','dismiss') THEN RETURN jsonb_build_object('error','action'); END IF;
  SELECT * INTO m FROM club_members WHERE id = p_member FOR UPDATE;
  IF NOT FOUND OR m.confirmed_at IS NULL THEN RETURN jsonb_build_object('error','no_session'); END IF;
  IF m.pending_crew_code IS NULL OR m.pending_crew_status IS NULL THEN RETURN jsonb_build_object('pending', NULL); END IF;
  in_any := EXISTS (SELECT 1 FROM club_crew_members WHERE site_id = m.site_id AND member_id = p_member);
  in_same := EXISTS (SELECT 1 FROM club_crew_members cm JOIN club_crews c ON c.id = cm.crew_id
                     WHERE cm.site_id = m.site_id AND cm.member_id = p_member AND c.code = m.pending_crew_code);
  IF p_action = 'dismiss' OR in_same OR (in_any AND m.pending_crew_status <> 'already_in_crew') THEN
    UPDATE club_members SET pending_crew_code = NULL, pending_crew_status = NULL, pending_crew_checked_at = NULL WHERE id = p_member;
    RETURN jsonb_build_object('pending', NULL);
  END IF;
  IF p_action = 'retry' THEN
    BEGIN
      j := club_crew_join(p_member, m.pending_crew_code);
      st := j->>'error';
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'club_crew_pending retry: %', SQLERRM; j := NULL; st := 'error'; END;
    IF st IS NULL THEN
      UPDATE club_members SET pending_crew_code = NULL, pending_crew_status = NULL, pending_crew_checked_at = NULL WHERE id = p_member;
      RETURN jsonb_build_object('pending', NULL, 'crew_id', j->'crew_id');
    END IF;
    m.pending_crew_status := CASE WHEN st IN ('crew_full','crew_not_found','already_in_crew') THEN st ELSE 'error' END;
    UPDATE club_members SET pending_crew_status = m.pending_crew_status, pending_crew_checked_at = now() WHERE id = p_member;
  END IF;
  SELECT name INTO nm FROM club_crews WHERE site_id = m.site_id AND code = m.pending_crew_code;
  RETURN jsonb_build_object('pending', jsonb_build_object('status', m.pending_crew_status, 'code', m.pending_crew_code, 'crew_name', nm));
END $function$
;
CREATE OR REPLACE FUNCTION public.club_ranking(p_site uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(member_id uuid, first_name text, email text, member_no integer, points bigint, level_name text, rank_pos bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH b AS (
    SELECT cm.id, cm.first_name, cm.email, cm.member_no, coalesce(sum(p.points),0)::bigint pts
      FROM club_members cm LEFT JOIN club_points p ON p.member_id = cm.id
     WHERE cm.site_id = p_site AND cm.confirmed_at IS NOT NULL
       AND (auth.role() = 'service_role' OR (public.portal_can_write() AND public.row_belongs_to_current_company(cm.company_id)))
     GROUP BY cm.id),
  r AS (SELECT b.*, rank() OVER (ORDER BY b.pts DESC, b.member_no ASC) rk FROM b)
  SELECT r.id, r.first_name, r.email, r.member_no, r.pts,
         (SELECT l.name FROM club_levels l WHERE l.site_id = p_site AND l.min_points <= r.pts ORDER BY l.min_points DESC LIMIT 1),
         r.rk
    FROM r ORDER BY r.rk LIMIT p_limit
$function$
;
CREATE OR REPLACE FUNCTION public.club_wallet_due(p_limit integer DEFAULT 200)
 RETURNS TABLE(pass_id uuid, member_id uuid, site_id uuid, points bigint, level_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH b AS (
    SELECT w.id, w.member_id, w.last_points, w.last_level, m.site_id,
           coalesce((SELECT sum(p.points) FROM club_points p WHERE p.member_id = w.member_id), 0)::bigint AS pts
      FROM club_wallet_passes w JOIN club_members m ON m.id = w.member_id
     WHERE w.platform = 'google')
  SELECT b.id, b.member_id, b.site_id, b.pts,
         (SELECT l.name FROM club_levels l WHERE l.site_id = b.site_id AND l.min_points <= b.pts ORDER BY l.min_points DESC LIMIT 1)
    FROM b
   WHERE b.last_points IS DISTINCT FROM b.pts
      OR b.last_level IS DISTINCT FROM (SELECT l.name FROM club_levels l WHERE l.site_id = b.site_id AND l.min_points <= b.pts ORDER BY l.min_points DESC LIMIT 1)
   LIMIT p_limit
$function$
;

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
