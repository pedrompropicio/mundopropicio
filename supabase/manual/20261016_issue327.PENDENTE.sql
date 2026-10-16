-- #327 — NÚCLEO DE PONTOS (aprovado por Pedro 16/10/2026 14:45 Fortaleza). FICHEIRO INERTE: NÃO APLICADO EM LIVE.
-- Fora de supabase/migrations e drizzle/migrations: nenhuma aplicação automática.
-- Aplicar este ficheiro NÃO muda valores: só cria a estrutura e uma configuração em 'draft'.
-- A mudança de regras e níveis só acontece com o CUTOVER explícito (20261016_issue327.CUTOVER.sql).
-- Reversão: 20261016_issue327.ROLLBACK.sql (repõe funções; não apaga créditos nem histórico).
--
-- Regras aprovadas (só com config 'active'):
--   inscrição 100 (1×/membro/edição) · indicação 75, teto 750/membro/edição (≤10 créditos de 75)
--   Crew 100 1×/membro/edição (independente do grupo; min 4 / max 6 incl. criador)
--   compra própria em lote elegível 200 1×/edição SÓ com prova verificada (purchase_enabled=false por omissão)
--   níveis Crew 750 / Goat 3000 com piso protegido (ninguém desce de nível no cutover)
--   conquistas 3 e 5 amigos confirmados: informativas, sem pontos.
-- Edição = event_id gravado em cada crédito no momento do crédito (imutável). Créditos antigos ficam com event_id NULL
-- (não se infere edição); só contam como consumo (nunca como crédito novo) na edição marcada legacy_counts.

-- 1) Estrutura -----------------------------------------------------------------------------------------------
ALTER TABLE public.club_points ADD COLUMN IF NOT EXISTS event_id uuid;
COMMENT ON COLUMN public.club_points.event_id IS '#327: edição (evento canónico) do crédito, gravada no momento do crédito. NULL = crédito anterior ao #327 (edição não provada).';

CREATE TABLE IF NOT EXISTS public.club_points_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id uuid NOT NULL REFERENCES public.portal_sites(id) ON DELETE CASCADE,
  version text NOT NULL,
  event_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  effective_at timestamptz,
  legacy_counts boolean NOT NULL DEFAULT false,
  join_points int NOT NULL CHECK (join_points >= 0),
  referral_points int NOT NULL CHECK (referral_points > 0),
  referral_cap int NOT NULL CHECK (referral_cap >= 0),
  crew_points int NOT NULL CHECK (crew_points >= 0),
  purchase_points int NOT NULL CHECK (purchase_points >= 0),
  purchase_enabled boolean NOT NULL DEFAULT false,
  purchase_lots text[] NOT NULL DEFAULT '{}',
  levels jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS club_points_config_one_active ON public.club_points_config(site_id) WHERE status = 'active';
COMMENT ON TABLE public.club_points_config IS '#327: configuração versionada das regras de pontos por site/edição. Só "active" altera o motor.';

CREATE TABLE IF NOT EXISTS public.club_level_floors (
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  config_id uuid NOT NULL REFERENCES public.club_points_config(id),
  site_id uuid NOT NULL,
  level_id uuid NOT NULL REFERENCES public.club_levels(id),
  level_name text NOT NULL,
  points_at_cutover bigint NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, config_id)
);
COMMENT ON TABLE public.club_level_floors IS '#327: nível adquirido no momento do cutover; o nível canónico nunca fica abaixo deste piso.';

CREATE TABLE IF NOT EXISTS public.club_points_cutover_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.club_points_config(id),
  site_id uuid NOT NULL,
  levels_before jsonb NOT NULL,
  levels_after jsonb NOT NULL,
  members_total int NOT NULL,
  floors_created int NOT NULL,
  done_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.club_referral_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  site_id uuid NOT NULL,
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  referee_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  event_id uuid,
  credited_points int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, referee_id)
);
COMMENT ON TABLE public.club_referral_events IS '#327: contagem real de amigos confirmados (conquistas 3/5), separada dos pontos (o teto não pára a contagem).';

CREATE TABLE IF NOT EXISTS public.club_purchase_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  site_id uuid NOT NULL,
  event_id uuid NOT NULL,
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('fever_order','manual_verified')),
  order_ref text NOT NULL,
  lot_ref text NOT NULL,
  status text NOT NULL CHECK (status IN ('valid','refunded','cancelled')),
  fingerprint text NOT NULL UNIQUE,
  verified_by uuid,
  verified_at timestamptz NOT NULL DEFAULT now(),
  credited_ref text,
  status_reason text
);
COMMENT ON TABLE public.club_purchase_evidence IS '#327: prova de compra (encomenda+lote+evento+estado). Um clique não é prova. Sem prova não há crédito.';

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['club_points_config','club_level_floors','club_points_cutover_log','club_referral_events','club_purchase_evidence'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t||'_select_staff') THEN
      EXECUTE format('CREATE POLICY %s_select_staff ON public.%I FOR SELECT TO authenticated USING (public.portal_can_write())', t, t);
    END IF;
  END LOOP;
END $$;

-- 2) Motor ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._club_active_cfg(p_site uuid) RETURNS public.club_points_config
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM club_points_config WHERE site_id = p_site AND status = 'active' AND effective_at <= now()
   ORDER BY effective_at DESC LIMIT 1
$$;

-- Pontos ainda ativos (não anulados) de uma regra na edição; legacy NULL só conta se a config o disser.
CREATE OR REPLACE FUNCTION public._club_rule_used(p_member uuid, p_rule text, p_event uuid, p_legacy boolean) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(sum(p.points),0)::int FROM club_points p
   WHERE p.member_id = p_member AND p.rule_key = p_rule
     AND (p.event_id = p_event OR (p_legacy AND p.event_id IS NULL))
     AND NOT EXISTS (SELECT 1 FROM club_points v WHERE v.member_id = p_member AND v.rule_key = 'void' AND v.ref_id = p_rule || ':' || p.ref_id)
$$;

-- Único ponto de escrita de créditos (todas as regras passam aqui).
CREATE OR REPLACE FUNCTION public._club_award_core(p_member uuid, p_rule text, p_ref text, p_points int, p_evidence uuid DEFAULT NULL) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; cfg club_points_config; ev uuid; pts int := p_points; ref text := p_ref; used int; e record; n int; BEGIN
  SELECT cm.id, cm.company_id, cm.site_id, ps.event_id AS site_event INTO m
    FROM club_members cm JOIN portal_sites ps ON ps.id = cm.site_id WHERE cm.id = p_member;
  IF NOT FOUND THEN RETURN 0; END IF;
  cfg := _club_active_cfg(m.site_id);
  IF cfg.id IS NULL THEN
    -- Antes do cutover: comportamento atual (mesmos valores), só passa a gravar a edição.
    IF coalesce(pts,0) <= 0 THEN RETURN 0; END IF;
    ev := m.site_event;
  ELSE
    ev := cfg.event_id;
    PERFORM pg_advisory_xact_lock(hashtext('club_award:'||p_member||':'||ev));
    IF p_rule = 'join_confirmed' THEN
      pts := cfg.join_points; ref := p_ref || '@' || ev;
      IF _club_rule_used(p_member, p_rule, ev, cfg.legacy_counts) > 0 THEN RETURN 0; END IF;
    ELSIF p_rule = 'friend_joined' THEN
      pts := cfg.referral_points;
      IF _club_rule_used(p_member, p_rule, ev, cfg.legacy_counts) + pts > cfg.referral_cap THEN RETURN 0; END IF;
    ELSIF p_rule = 'crew_complete' THEN
      pts := cfg.crew_points;
      IF _club_rule_used(p_member, p_rule, ev, cfg.legacy_counts) > 0 THEN RETURN 0; END IF;
    ELSIF p_rule = 'promo_lot_purchase' THEN
      -- Fail-closed: só com prova válida desta edição, lote elegível e compra ativa na config.
      IF NOT cfg.purchase_enabled OR p_evidence IS NULL THEN RETURN 0; END IF;
      SELECT * INTO e FROM club_purchase_evidence WHERE id = p_evidence;
      IF NOT FOUND OR e.member_id <> p_member OR e.status <> 'valid' OR e.event_id <> ev OR NOT (e.lot_ref = ANY(cfg.purchase_lots)) THEN RETURN 0; END IF;
      pts := cfg.purchase_points;
      IF _club_rule_used(p_member, p_rule, ev, cfg.legacy_counts) > 0 THEN RETURN 0; END IF;
    END IF;
    IF coalesce(pts,0) <= 0 THEN RETURN 0; END IF;
  END IF;
  INSERT INTO club_points(company_id, member_id, rule_key, points, ref_id, event_id)
    VALUES (m.company_id, p_member, p_rule, pts, ref, ev) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN CASE WHEN n > 0 THEN pts ELSE 0 END;
END $$;

CREATE OR REPLACE FUNCTION public.club_award(p_member uuid, p_rule text, p_ref text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid; pts int; BEGIN
  SELECT site_id INTO s FROM club_members WHERE id = p_member; IF NOT FOUND THEN RETURN 0; END IF;
  SELECT points INTO pts FROM club_point_rules WHERE site_id = s AND rule_key = p_rule AND active;
  IF pts IS NULL THEN RETURN 0; END IF;
  RETURN _club_award_core(p_member, p_rule, p_ref, pts, NULL);
END $$;

CREATE OR REPLACE FUNCTION public.club_award_fixed(p_member uuid, p_rule text, p_ref text, p_points int) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF coalesce(p_points,0) <= 0 THEN RETURN 0; END IF;
  RETURN _club_award_core(p_member, p_rule, p_ref, p_points, NULL);
END $$;

-- Confirmação: corpo #328 preservado; indicação só na PRIMEIRA confirmação e só para a atribuição original.
CREATE OR REPLACE FUNCTION public.club_confirm_member(p_member uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; prev timestamptz; j jsonb; st text; got int; cfg club_points_config; ev uuid; BEGIN
  SELECT confirmed_at INTO prev FROM club_members WHERE id = p_member FOR UPDATE;
  UPDATE club_members SET confirmed_at = coalesce(confirmed_at, now()), updated_at = now() WHERE id = p_member RETURNING * INTO m;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM club_award(p_member, 'join_confirmed', p_member::text);
  IF prev IS NULL AND m.referred_by_member_id IS NOT NULL AND m.referred_by_member_id <> p_member THEN
    got := club_award(m.referred_by_member_id, 'friend_joined', p_member::text);
    cfg := _club_active_cfg(m.site_id);
    ev := coalesce(cfg.event_id, (SELECT event_id FROM portal_sites WHERE id = m.site_id));
    INSERT INTO club_referral_events(company_id, site_id, member_id, referee_id, event_id, credited_points)
      VALUES (m.company_id, m.site_id, m.referred_by_member_id, p_member, ev, got) ON CONFLICT DO NOTHING;
  END IF;
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
END $$;

-- Compra: crédito só a partir de prova; reembolso anula (nunca apaga); reaprovação gera nova geração ref#N.
CREATE OR REPLACE FUNCTION public.club_award_purchase(p_evidence uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e record; g int; base text; ref text; got int; BEGIN
  SELECT * INTO e FROM club_purchase_evidence WHERE id = p_evidence FOR UPDATE;
  IF NOT FOUND OR e.status <> 'valid' THEN RETURN 0; END IF;
  base := 'purchase@' || e.event_id;
  IF (club_points_active(e.member_id, 'promo_lot_purchase', base)).id IS NOT NULL THEN RETURN 0; END IF;
  SELECT count(*) INTO g FROM club_points WHERE member_id = e.member_id AND rule_key = 'promo_lot_purchase' AND (ref_id = base OR ref_id LIKE base || '#%');
  ref := CASE WHEN g = 0 THEN base ELSE base || '#' || (g + 1) END;
  got := _club_award_core(e.member_id, 'promo_lot_purchase', ref, 0, p_evidence);
  IF got > 0 THEN UPDATE club_purchase_evidence SET credited_ref = ref WHERE id = p_evidence; END IF;
  RETURN got;
END $$;

CREATE OR REPLACE FUNCTION public.club_purchase_revoke(p_evidence uuid, p_status text, p_reason text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e record; r club_points; BEGIN
  IF p_status NOT IN ('refunded','cancelled') OR coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'estado/motivo inválido'; END IF;
  SELECT * INTO e FROM club_purchase_evidence WHERE id = p_evidence FOR UPDATE; IF NOT FOUND THEN RETURN 0; END IF;
  UPDATE club_purchase_evidence SET status = p_status, status_reason = p_reason WHERE id = p_evidence;
  IF e.credited_ref IS NULL THEN RETURN 0; END IF;
  SELECT * INTO r FROM club_points WHERE member_id = e.member_id AND rule_key = 'promo_lot_purchase' AND ref_id = e.credited_ref;
  RETURN _club_points_void_row(r, p_reason);
END $$;

-- 3) Nível canónico (API, ranking CRM, Wallet) ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.club_member_level(p_member uuid)
RETURNS TABLE(points bigint, level_name text, protected boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH m AS (SELECT id, site_id FROM club_members WHERE id = p_member),
  p AS (SELECT coalesce(sum(cp.points),0)::bigint pts FROM club_points cp WHERE cp.member_id = p_member),
  byp AS (SELECT l.name, l.min_points FROM club_levels l, m, p WHERE l.site_id = m.site_id AND l.min_points <= p.pts ORDER BY l.min_points DESC LIMIT 1),
  fl AS (SELECT l.name, l.min_points FROM club_level_floors f JOIN club_levels l ON l.id = f.level_id, m
          WHERE f.member_id = m.id ORDER BY l.min_points DESC LIMIT 1)
  SELECT p.pts,
         CASE WHEN fl.name IS NOT NULL AND (byp.min_points IS NULL OR fl.min_points > byp.min_points) THEN fl.name ELSE byp.name END,
         (fl.name IS NOT NULL AND (byp.min_points IS NULL OR fl.min_points > byp.min_points))
    FROM p LEFT JOIN byp ON true LEFT JOIN fl ON true
$$;

CREATE OR REPLACE FUNCTION public.club_ranking(p_site uuid, p_limit int DEFAULT 100)
RETURNS TABLE(member_id uuid, first_name text, email text, member_no int, points bigint, level_name text, rank_pos bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH b AS (
    SELECT cm.id, cm.first_name, cm.email, cm.member_no, coalesce(sum(p.points),0)::bigint pts
      FROM club_members cm LEFT JOIN club_points p ON p.member_id = cm.id
     WHERE cm.site_id = p_site AND cm.confirmed_at IS NOT NULL
       AND (auth.role() = 'service_role' OR (public.portal_can_write() AND public.row_belongs_to_current_company(cm.company_id)))
     GROUP BY cm.id),
  r AS (SELECT b.*, rank() OVER (ORDER BY b.pts DESC, b.member_no ASC) rk FROM b)
  SELECT r.id, r.first_name, r.email, r.member_no, r.pts,
         (SELECT x.level_name FROM club_member_level(r.id) x),
         r.rk
    FROM r ORDER BY r.rk LIMIT p_limit
$$;

CREATE OR REPLACE FUNCTION public.club_wallet_due(p_limit int DEFAULT 200)
RETURNS TABLE(pass_id uuid, member_id uuid, site_id uuid, points bigint, level_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH b AS (
    SELECT w.id, w.member_id, w.last_points, w.last_level, m.site_id, x.points AS pts, x.level_name AS lvl
      FROM club_wallet_passes w JOIN club_members m ON m.id = w.member_id
      CROSS JOIN LATERAL club_member_level(w.member_id) x
     WHERE w.platform = 'google')
  SELECT b.id, b.member_id, b.site_id, b.pts, b.lvl FROM b
   WHERE b.last_points IS DISTINCT FROM b.pts OR b.last_level IS DISTINCT FROM b.lvl
   LIMIT p_limit
$$;

-- 4) Conquistas 3/5 (informativas; só contagens, sem identidades) ---------------------------------------------
CREATE OR REPLACE FUNCTION public.club_referral_progress(p_member uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH m AS (SELECT id, site_id FROM club_members WHERE id = p_member),
  ev AS (SELECT coalesce((_club_active_cfg(m.site_id)).event_id, (SELECT event_id FROM portal_sites WHERE id = m.site_id)) e FROM m),
  c AS (SELECT count(*)::int n FROM club_referral_events r JOIN club_members x ON x.id = r.referee_id, ev
         WHERE r.member_id = p_member AND r.event_id = ev.e AND x.confirmed_at IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM club_points v WHERE v.member_id = r.referee_id AND v.rule_key = 'void' AND v.ref_id LIKE 'join_confirmed:%'))
  SELECT jsonb_build_object('confirmed_friends', c.n,
           'badges', jsonb_build_object('friends_3', c.n >= 3, 'friends_5', c.n >= 5)) FROM c
$$;

-- 5) Cutover explícito (uma transação): pisos de nível + novos limiares + config ativa -------------------------
CREATE OR REPLACE FUNCTION public.club_points_cutover(p_config uuid, p_expected_levels jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c club_points_config; before jsonb; after jsonb; nf int; nm int; k text; BEGIN
  SELECT * INTO c FROM club_points_config WHERE id = p_config FOR UPDATE;
  IF NOT FOUND OR c.status <> 'draft' THEN RAISE EXCEPTION 'cutover: config inexistente ou não draft'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('club_cutover:'||c.site_id));
  LOCK TABLE club_points IN SHARE ROW EXCLUSIVE MODE;   -- nenhum crédito novo entre o retrato e a troca
  LOCK TABLE club_levels IN SHARE ROW EXCLUSIVE MODE;
  SELECT jsonb_object_agg(name, min_points) INTO before FROM club_levels WHERE site_id = c.site_id;
  IF before IS DISTINCT FROM p_expected_levels THEN RAISE EXCEPTION 'cutover: níveis atuais % <> esperados %', before, p_expected_levels; END IF;
  INSERT INTO club_level_floors(member_id, config_id, site_id, level_id, level_name, points_at_cutover)
  SELECT cm.id, c.id, c.site_id, l.id, l.name, t.pts
    FROM club_members cm
    CROSS JOIN LATERAL (SELECT coalesce(sum(points),0)::bigint pts FROM club_points WHERE member_id = cm.id) t
    CROSS JOIN LATERAL (SELECT * FROM club_levels l WHERE l.site_id = c.site_id AND l.min_points <= t.pts ORDER BY l.min_points DESC LIMIT 1) l
   WHERE cm.site_id = c.site_id AND l.min_points > 0
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS nf = ROW_COUNT;
  SELECT count(*) INTO nm FROM club_members WHERE site_id = c.site_id;
  FOR k IN SELECT jsonb_object_keys(c.levels) LOOP
    UPDATE club_levels SET min_points = (c.levels->>k)::int WHERE site_id = c.site_id AND name = k;
    IF NOT FOUND THEN RAISE EXCEPTION 'cutover: nível % não existe', k; END IF;
  END LOOP;
  SELECT jsonb_object_agg(name, min_points) INTO after FROM club_levels WHERE site_id = c.site_id;
  UPDATE club_points_config SET status = 'retired' WHERE site_id = c.site_id AND status = 'active';
  UPDATE club_points_config SET status = 'active', effective_at = now() WHERE id = c.id;
  INSERT INTO club_points_cutover_log(config_id, site_id, levels_before, levels_after, members_total, floors_created)
    VALUES (c.id, c.site_id, before, after, nm, nf);
  RETURN jsonb_build_object('levels_before', before, 'levels_after', after, 'members', nm, 'floors', nf);
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['_club_active_cfg(uuid)','_club_rule_used(uuid,text,uuid,boolean)','_club_award_core(uuid,text,text,int,uuid)',
    'club_award(uuid,text,text)','club_award_fixed(uuid,text,text,int)','club_confirm_member(uuid)','club_award_purchase(uuid)',
    'club_purchase_revoke(uuid,text,text)','club_member_level(uuid)','club_wallet_due(int)','club_referral_progress(uuid)','club_points_cutover(uuid,jsonb)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
-- club_ranking mantém o grant atual (authenticated, filtrado por portal_can_write dentro da função).

-- 6) Configuração da edição Newgang 2027 em DRAFT (não muda nada até ao cutover) ----------------------------------
INSERT INTO public.club_points_config(company_id, site_id, version, event_id, status, legacy_counts,
  join_points, referral_points, referral_cap, crew_points, purchase_points, purchase_enabled, purchase_lots, levels)
SELECT ps.company_id, ps.id, '2027-v1', '407f43fc-790f-4ea7-8b2a-4162805dfb16', 'draft', true,
       100, 75, 750, 100, 200, false, '{}', '{"Gang":0,"Crew":750,"Goat":3000}'::jsonb
  FROM public.portal_sites ps
 WHERE ps.id = 'f8ce23a5-a27a-4893-9b7a-d6337d84b168' AND ps.event_id = '407f43fc-790f-4ea7-8b2a-4162805dfb16'
ON CONFLICT (site_id, version) DO NOTHING;
