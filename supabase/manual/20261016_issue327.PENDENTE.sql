-- #327 — NÚCLEO DE PONTOS (aprovado por Pedro 16/10/2026 14:45 Fortaleza).
-- ESTADO: APLICADO EM LIVE (infra) 16/10/2026 ~19:20 UTC como drizzle/migrations/0177 + 0178 (0178: corpo do cutover verbatim
-- e REVOKE dos privilégios por omissão do schema — anon e escrita de authenticated — nas 6 tabelas novas).
-- CUTOVER: PENDENTE (não executado; config 2027-v1 em draft). Ver docs/testes/issue327/aplicacao-infra.md.
-- O FICHEIRO guardado aqui é inerte (fora de supabase/migrations e drizzle/migrations; nada o aplica sozinho).
-- APLICÁ-LO MUDA O RUNTIME, mesmo sem cutover (ver docs/testes/issue327/README.md, "Impacto pré-cutover"):
--   * substitui club_award, club_award_fixed, club_confirm_member, club_ranking, club_wallet_due;
--   * todos os créditos novos passam a gravar club_points.event_id (= portal_sites.event_id no momento);
--   * a confirmação passa a registar club_referral_events e a pedir um bloqueio partilhado por site;
--   * os VALORES pagos ficam iguais aos de hoje até ao CUTOVER explícito (20261016_issue327.CUTOVER.sql).
-- Reversão: 20261016_issue327.ROLLBACK.sql (primeiro reverter a API, depois o SQL).
--
-- Regras aprovadas (só com config 'active' da edição corrente do site):
--   inscrição 100 (1× por adesão ao site: a ref é o membro — NÃO é 1× por edição; ver README)
--   indicação 75, teto 750/membro/edição · Crew 100 1×/membro/edição (min 4 / max 6 incl. criador)
--   compra própria em lote elegível 200 1×/edição SÓ com prova verificada (purchase_enabled=false por omissão)
--   níveis Crew 750 / Goat 3000 com piso protegido · conquistas 3 e 5 amigos confirmados, sem pontos.

-- 1) Estrutura -----------------------------------------------------------------------------------------------
ALTER TABLE public.club_points ADD COLUMN IF NOT EXISTS event_id uuid;
COMMENT ON COLUMN public.club_points.event_id IS '#327: edição (evento canónico) do crédito, gravada no momento do crédito. NULL = crédito anterior ao #327 (edição não provada).';

CREATE TABLE IF NOT EXISTS public.club_points_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id uuid NOT NULL REFERENCES public.portal_sites(id) ON DELETE CASCADE,
  version text NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  effective_at timestamptz,
  legacy_counts boolean NOT NULL DEFAULT false,
  referral_void_frees_cap boolean NOT NULL DEFAULT false,
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
COMMENT ON TABLE public.club_points_config IS '#327: configuração versionada por site/edição. Só "active" e só quando event_id = portal_sites.event_id altera o motor.';
COMMENT ON COLUMN public.club_points_config.referral_void_frees_cap IS '#327 PROPOSTA NÃO APROVADA: true = indicação anulada liberta espaço no teto. Omissão false (conservador).';

CREATE TABLE IF NOT EXISTS public.club_level_floors (
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  config_id uuid NOT NULL REFERENCES public.club_points_config(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id uuid NOT NULL REFERENCES public.portal_sites(id) ON DELETE CASCADE,
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
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id uuid NOT NULL REFERENCES public.portal_sites(id) ON DELETE CASCADE,
  site_event_id uuid NOT NULL,
  levels_before jsonb NOT NULL,
  levels_after jsonb NOT NULL,
  rules_before jsonb NOT NULL,
  rules_after jsonb NOT NULL,
  members_total int NOT NULL,
  floors_created int NOT NULL,
  legacy_rows int NOT NULL,
  done_at timestamptz NOT NULL DEFAULT now()
);

-- Consumo legado: retrato IMUTÁVEL tirado no cutover (créditos sem edição, ativos, das regras controladas), só se a
-- config tiver legacy_counts e o site apontar para o evento da config nesse momento. Não altera o ledger.
CREATE TABLE IF NOT EXISTS public.club_legacy_consumption (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id uuid NOT NULL REFERENCES public.portal_sites(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id),
  config_id uuid NOT NULL REFERENCES public.club_points_config(id),
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  points int NOT NULL,
  rows_counted int NOT NULL,
  first_at timestamptz, last_at timestamptz,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, event_id, member_id, rule_key)
);

CREATE TABLE IF NOT EXISTS public.club_referral_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id uuid NOT NULL REFERENCES public.portal_sites(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  referee_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id),
  credited_points int NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'live' CHECK (source IN ('live','legacy_snapshot')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, referee_id)
);
COMMENT ON TABLE public.club_referral_events IS '#327: contagem real de amigos confirmados (conquistas 3/5), separada dos pontos (o teto não pára a contagem).';

CREATE TABLE IF NOT EXISTS public.club_purchase_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id uuid NOT NULL REFERENCES public.portal_sites(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id),
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('fever_order','manual_verified')),
  order_ref text NOT NULL CHECK (btrim(order_ref) <> ''),
  lot_ref text NOT NULL,
  status text NOT NULL CHECK (status IN ('valid','refunded','cancelled')),
  fingerprint text NOT NULL UNIQUE,
  verified_by uuid,
  verified_at timestamptz NOT NULL DEFAULT now(),
  credited_ref text,
  status_reason text
);
-- Uma encomenda (fonte+edição) só pode provar a compra de UM membro, seja qual for o fingerprint.
-- O prémio é 1×/membro/edição, por isso lote/unidade não entram na chave.
CREATE UNIQUE INDEX IF NOT EXISTS club_purchase_evidence_order_uq
  ON public.club_purchase_evidence(source, event_id, lower(btrim(order_ref)));
COMMENT ON TABLE public.club_purchase_evidence IS '#327: prova de compra (encomenda+lote+evento+estado). Um clique não é prova. Sem prova não há crédito.';

CREATE INDEX IF NOT EXISTS club_points_member_rule_event_idx ON public.club_points(member_id, rule_key, event_id);
CREATE INDEX IF NOT EXISTS club_referral_events_member_event_idx ON public.club_referral_events(member_id, event_id);

-- Coesão membro/site/empresa/evento nas tabelas novas (FKs simples não bastam para relações cruzadas).
CREATE OR REPLACE FUNCTION public._club327_cohesion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; BEGIN
  SELECT company_id INTO s FROM portal_sites WHERE id = NEW.site_id;
  IF NOT FOUND OR s.company_id <> NEW.company_id THEN RAISE EXCEPTION '#327 coesão: site/empresa (%)', TG_TABLE_NAME; END IF;
  IF TG_TABLE_NAME IN ('club_level_floors','club_legacy_consumption','club_referral_events','club_purchase_evidence') THEN
    IF NOT EXISTS (SELECT 1 FROM club_members WHERE id = NEW.member_id AND site_id = NEW.site_id AND company_id = NEW.company_id) THEN
      RAISE EXCEPTION '#327 coesão: membro fora do site/empresa (%)', TG_TABLE_NAME; END IF;
  END IF;
  IF TG_TABLE_NAME = 'club_referral_events' THEN
    IF NOT EXISTS (SELECT 1 FROM club_members WHERE id = NEW.referee_id AND site_id = NEW.site_id) THEN
      RAISE EXCEPTION '#327 coesão: indicado fora do site'; END IF;
  END IF;
  IF TG_TABLE_NAME = 'club_level_floors' THEN
    IF NOT EXISTS (SELECT 1 FROM club_levels WHERE id = NEW.level_id AND site_id = NEW.site_id) THEN
      RAISE EXCEPTION '#327 coesão: nível fora do site'; END IF;
  END IF;
  IF TG_TABLE_NAME IN ('club_level_floors','club_legacy_consumption','club_points_cutover_log') THEN
    IF NOT EXISTS (SELECT 1 FROM club_points_config WHERE id = NEW.config_id AND site_id = NEW.site_id) THEN
      RAISE EXCEPTION '#327 coesão: config fora do site (%)', TG_TABLE_NAME; END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['club_points_config','club_level_floors','club_points_cutover_log','club_legacy_consumption','club_referral_events','club_purchase_evidence'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- Só leitura para staff com escrita no portal E da empresa da linha (isolamento canónico). Escrita só via service_role/RPC.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select_staff', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.portal_can_write() AND public.row_belongs_to_current_company(company_id))', t||'_select_staff', t);
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t||'_c327' AND NOT tgisinternal) THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public._club327_cohesion()', t||'_c327', t);
    END IF;
  END LOOP;
END $$;

-- 2) Motor ---------------------------------------------------------------------------------------------------
-- Bloqueio por site: créditos pedem-no PARTILHADO antes de ler a config; o cutover pede-o EXCLUSIVO.
-- Ordem global: site (advisory) → linha do membro / bloqueio por membro. Nunca o inverso.
CREATE OR REPLACE FUNCTION public._club_site_lock(p_site uuid, p_exclusive boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_exclusive THEN PERFORM pg_advisory_xact_lock(327, hashtext(p_site::text));
  ELSE PERFORM pg_advisory_xact_lock_shared(327, hashtext(p_site::text)); END IF;
END $$;

CREATE OR REPLACE FUNCTION public._club_active_cfg(p_site uuid) RETURNS public.club_points_config
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM club_points_config WHERE site_id = p_site AND status = 'active' ORDER BY effective_at DESC LIMIT 1
$$;

-- Consumo de uma regra controlada na edição da config: créditos com a edição + retrato legado imutável dessa edição.
-- Anulados não contam, exceto indicações quando a config não liberta o teto (omissão).
CREATE OR REPLACE FUNCTION public._club_rule_used(p_member uuid, p_rule text, p_cfg uuid) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH c AS (SELECT * FROM club_points_config WHERE id = p_cfg)
  SELECT (coalesce((SELECT sum(p.points) FROM club_points p, c
            WHERE p.member_id = p_member AND p.rule_key = p_rule AND p.event_id = c.event_id
              AND ((p_rule = 'friend_joined' AND NOT c.referral_void_frees_cap)
                   OR NOT EXISTS (SELECT 1 FROM club_points v WHERE v.member_id = p_member AND v.rule_key = 'void' AND v.ref_id = p_rule || ':' || p.ref_id))), 0)
        + coalesce((SELECT sum(l.points) FROM club_legacy_consumption l, c
            WHERE l.member_id = p_member AND l.rule_key = p_rule AND l.event_id = c.event_id AND l.site_id = c.site_id), 0))::int
$$;

-- Único ponto de escrita de créditos (todas as regras passam aqui).
CREATE OR REPLACE FUNCTION public._club_award_core(p_member uuid, p_rule text, p_ref text, p_points int, p_evidence uuid DEFAULT NULL) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; cfg club_points_config; ev uuid; pts int := p_points; e record; n int;
        controlled boolean := p_rule IN ('join_confirmed','friend_joined','crew_complete','promo_lot_purchase'); BEGIN
  SELECT cm.id, cm.company_id, cm.site_id INTO m FROM club_members cm WHERE cm.id = p_member;
  IF NOT FOUND THEN RETURN 0; END IF;
  PERFORM _club_site_lock(m.site_id, false);           -- ANTES de ler config/edição
  SELECT event_id INTO ev FROM portal_sites WHERE id = m.site_id;
  cfg := _club_active_cfg(m.site_id);
  IF cfg.id IS NULL OR NOT controlled THEN
    -- Sem config ativa, ou regra não controlada: valores atuais; grava a edição corrente do site.
    IF p_rule = 'promo_lot_purchase' AND cfg.id IS NOT NULL THEN RETURN 0; END IF;
    IF coalesce(pts,0) <= 0 THEN RETURN 0; END IF;
  ELSE
    -- Config ativa mas de outra edição (site mudou de evento sem cutover): regras controladas falham fechadas.
    IF ev IS DISTINCT FROM cfg.event_id THEN RETURN 0; END IF;
    PERFORM pg_advisory_xact_lock(3271, hashtext(p_member::text || ':' || p_rule || ':' || ev::text));
    IF p_rule = 'join_confirmed' THEN
      pts := cfg.join_points;
      IF _club_rule_used(p_member, p_rule, cfg.id) > 0 THEN RETURN 0; END IF;
    ELSIF p_rule = 'friend_joined' THEN
      pts := cfg.referral_points;
      IF _club_rule_used(p_member, p_rule, cfg.id) + pts > cfg.referral_cap THEN RETURN 0; END IF;
    ELSIF p_rule = 'crew_complete' THEN
      pts := cfg.crew_points;
      IF _club_rule_used(p_member, p_rule, cfg.id) > 0 THEN RETURN 0; END IF;
    ELSE -- promo_lot_purchase: fail-closed, só com prova válida desta edição/membro/site e lote elegível.
      IF NOT cfg.purchase_enabled OR p_evidence IS NULL THEN RETURN 0; END IF;
      SELECT * INTO e FROM club_purchase_evidence WHERE id = p_evidence;
      IF NOT FOUND OR e.member_id <> p_member OR e.site_id <> m.site_id OR e.company_id <> m.company_id
         OR e.status <> 'valid' OR e.event_id <> ev OR NOT (e.lot_ref = ANY(cfg.purchase_lots)) THEN RETURN 0; END IF;
      pts := cfg.purchase_points;
      IF _club_rule_used(p_member, p_rule, cfg.id) > 0 THEN RETURN 0; END IF;
    END IF;
    IF coalesce(pts,0) <= 0 THEN RETURN 0; END IF;
  END IF;
  INSERT INTO club_points(company_id, member_id, rule_key, points, ref_id, event_id)
    VALUES (m.company_id, p_member, p_rule, pts, p_ref, ev) ON CONFLICT DO NOTHING;
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

-- Confirmação: corpo #328 preservado; bloqueio do site ANTES da linha do membro (evita ciclo com o cutover);
-- indicação só na PRIMEIRA confirmação e só para a atribuição original.
CREATE OR REPLACE FUNCTION public.club_confirm_member(p_member uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; s uuid; prev timestamptz; j jsonb; st text; got int; cfg club_points_config; ev uuid; BEGIN
  SELECT site_id INTO s FROM club_members WHERE id = p_member; IF NOT FOUND THEN RETURN; END IF;
  PERFORM _club_site_lock(s, false);
  SELECT confirmed_at INTO prev FROM club_members WHERE id = p_member FOR NO KEY UPDATE;
  UPDATE club_members SET confirmed_at = coalesce(confirmed_at, now()), updated_at = now() WHERE id = p_member RETURNING * INTO m;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM club_award(p_member, 'join_confirmed', p_member::text);
  IF prev IS NULL AND m.referred_by_member_id IS NOT NULL AND m.referred_by_member_id <> p_member THEN
    got := club_award(m.referred_by_member_id, 'friend_joined', p_member::text);
    SELECT event_id INTO ev FROM portal_sites WHERE id = m.site_id;
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
  SELECT * INTO e FROM club_purchase_evidence WHERE id = p_evidence;
  IF NOT FOUND THEN RETURN 0; END IF;
  PERFORM _club_site_lock(e.site_id, false);
  SELECT * INTO e FROM club_purchase_evidence WHERE id = p_evidence FOR UPDATE;
  IF e.status <> 'valid' THEN RETURN 0; END IF;
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
  IF p_status IS NULL OR p_status NOT IN ('refunded','cancelled') OR coalesce(btrim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'club_purchase_revoke: estado/motivo inválido' USING ERRCODE = '22023'; END IF;
  SELECT * INTO e FROM club_purchase_evidence WHERE id = p_evidence; IF NOT FOUND THEN RETURN 0; END IF;
  PERFORM _club_site_lock(e.site_id, false);          -- ordem global: site → linha
  SELECT * INTO e FROM club_purchase_evidence WHERE id = p_evidence FOR UPDATE; IF NOT FOUND THEN RETURN 0; END IF;
  UPDATE club_purchase_evidence SET status = p_status, status_reason = p_reason WHERE id = p_evidence;
  IF e.credited_ref IS NULL THEN RETURN 0; END IF;
  SELECT * INTO r FROM club_points WHERE member_id = e.member_id AND rule_key = 'promo_lot_purchase' AND ref_id = e.credited_ref;
  RETURN _club_points_void_row(r, p_reason);
END $$;

-- Convite de Crew pendente (#328): corpo de 0176 preservado; ÚNICA alteração = bloqueio partilhado do site ANTES da
-- linha do membro, e a linha passa a FOR NO KEY UPDATE (continua a serializar status/retry/dismiss do mesmo membro,
-- mas já não conflitua com o KEY SHARE da FK de club_level_floors). Sem isto: retry segura o membro → crew_check →
-- motor pede o site partilhado; o cutover segura o site exclusivo → INSERT do piso pede KEY SHARE do mesmo membro = ciclo.
CREATE OR REPLACE FUNCTION public.club_crew_pending(p_member uuid, p_action text DEFAULT 'status') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; j jsonb; st text; nm text; in_same boolean; in_any boolean; s uuid; BEGIN
  IF p_action IS NULL OR p_action NOT IN ('status','retry','dismiss') THEN RETURN jsonb_build_object('error','action'); END IF;
  SELECT site_id INTO s FROM club_members WHERE id = p_member;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','no_session'); END IF;
  PERFORM _club_site_lock(s, false);
  SELECT * INTO m FROM club_members WHERE id = p_member FOR NO KEY UPDATE;
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
END $$;
REVOKE ALL ON FUNCTION public.club_crew_pending(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_crew_pending(uuid, text) TO service_role;

-- 3) Nível canónico (API me/ranking/Wallet, CRM, cron Wallet) ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.club_member_level(p_member uuid)
RETURNS TABLE(points bigint, level_name text, protected boolean, next_level_name text, next_level_min int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH m AS (SELECT id, site_id FROM club_members WHERE id = p_member),
  p AS (SELECT coalesce(sum(cp.points),0)::bigint pts FROM club_points cp WHERE cp.member_id = p_member),
  byp AS (SELECT l.name, l.min_points FROM club_levels l, m, p WHERE l.site_id = m.site_id AND l.min_points <= p.pts ORDER BY l.min_points DESC LIMIT 1),
  fl AS (SELECT l.name, l.min_points FROM club_level_floors f JOIN club_levels l ON l.id = f.level_id, m
          WHERE f.member_id = m.id ORDER BY l.min_points DESC LIMIT 1),
  cur AS (SELECT CASE WHEN fl.name IS NOT NULL AND (byp.min_points IS NULL OR fl.min_points > byp.min_points) THEN fl.name ELSE byp.name END nm,
                 CASE WHEN fl.name IS NOT NULL AND (byp.min_points IS NULL OR fl.min_points > byp.min_points) THEN fl.min_points ELSE byp.min_points END mn,
                 (fl.name IS NOT NULL AND (byp.min_points IS NULL OR fl.min_points > byp.min_points)) prot
            FROM p LEFT JOIN byp ON true LEFT JOIN fl ON true),
  nx AS (SELECT l.name, l.min_points FROM club_levels l, m, cur WHERE l.site_id = m.site_id AND l.min_points > coalesce(cur.mn, -1)
          ORDER BY l.min_points LIMIT 1)
  SELECT p.pts, cur.nm, cur.prot, nx.name, nx.min_points
    FROM m, p, cur LEFT JOIN nx ON true
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

-- 4) Montra canónica: o que site, me, CRM, ajuda e Wallet devem mostrar (valores = os que o motor paga agora) -----
CREATE OR REPLACE FUNCTION public.club_rules_public(p_site uuid)
RETURNS TABLE(rule_key text, label text, points int, active boolean, available boolean, status text,
              cap int, scope text, event_id uuid, config_version text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg club_points_config; ev uuid; mism boolean; BEGIN
  SELECT ps.event_id INTO ev FROM portal_sites ps WHERE ps.id = p_site;
  cfg := _club_active_cfg(p_site);
  mism := cfg.id IS NOT NULL AND ev IS DISTINCT FROM cfg.event_id;
  RETURN QUERY
  SELECT r.rule_key, r.label,
         CASE WHEN cfg.id IS NULL THEN r.points
              WHEN r.rule_key = 'join_confirmed' THEN cfg.join_points
              WHEN r.rule_key = 'friend_joined' THEN cfg.referral_points
              WHEN r.rule_key = 'crew_complete' THEN cfg.crew_points
              WHEN r.rule_key = 'promo_lot_purchase' THEN cfg.purchase_points
              ELSE r.points END,
         r.active,
         x.st = 'ok', x.st,
         CASE WHEN cfg.id IS NOT NULL AND r.rule_key = 'friend_joined' THEN cfg.referral_cap END,
         CASE WHEN cfg.id IS NULL THEN NULL
              WHEN r.rule_key = 'join_confirmed' THEN 'adesao'
              WHEN r.rule_key IN ('friend_joined','crew_complete','promo_lot_purchase') THEN 'edicao' END,
         CASE WHEN cfg.id IS NOT NULL THEN cfg.event_id ELSE ev END,
         cfg.version
    FROM club_point_rules r
    CROSS JOIN LATERAL (SELECT CASE
        WHEN NOT r.active THEN 'inativa'
        WHEN r.rule_key IN ('join_confirmed','friend_joined','crew_complete','promo_lot_purchase') AND mism THEN 'edicao_sem_config'
        WHEN r.rule_key = 'promo_lot_purchase' AND NOT coalesce(cfg.purchase_enabled, false) THEN 'sem_integracao'
        WHEN r.rule_key = 'friend_bought' THEN 'sem_integracao'   -- PROPOSTA: nenhum código atribui hoje
        ELSE 'ok' END st) x
   WHERE r.site_id = p_site
   ORDER BY r.points, r.rule_key;
END $$;

-- 5) Conquistas 3/5 (informativas; só contagens, sem identidades) ---------------------------------------------
-- Conta indicados distintos registados para a edição corrente do site cuja inscrição está ATIVA (a geração mais recente
-- de join_confirmed não anulada). Anulação seguida de reaprovação (ref#N) volta a contar.
CREATE OR REPLACE FUNCTION public.club_referral_progress(p_member uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH m AS (SELECT cm.id, ps.event_id e FROM club_members cm JOIN portal_sites ps ON ps.id = cm.site_id WHERE cm.id = p_member),
  c AS (SELECT count(DISTINCT r.referee_id)::int n FROM club_referral_events r JOIN club_members x ON x.id = r.referee_id, m
         WHERE r.member_id = m.id AND r.event_id = m.e AND x.confirmed_at IS NOT NULL
           AND (club_points_active(r.referee_id, 'join_confirmed', r.referee_id::text)).id IS NOT NULL)
  SELECT jsonb_build_object('confirmed_friends', c.n,
           'badges', jsonb_build_object('friends_3', c.n >= 3, 'friends_5', c.n >= 5)) FROM c
$$;

-- 6) Cutover explícito (uma transação): retrato legado + pisos + limiares + regras visíveis + config ativa -------
CREATE OR REPLACE FUNCTION public.club_points_cutover(p_config uuid, p_expected_levels jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c club_points_config; s uuid; ev uuid; before jsonb; after jsonb; rb jsonb; ra jsonb; nf int; nm int; nl int := 0; k text; BEGIN
  SELECT site_id INTO s FROM club_points_config WHERE id = p_config;
  IF NOT FOUND THEN RAISE EXCEPTION 'cutover: config inexistente'; END IF;
  PERFORM _club_site_lock(s, true);                 -- espera pelos créditos em curso; novos esperam por nós
  SELECT * INTO c FROM club_points_config WHERE id = p_config FOR UPDATE;
  IF c.status <> 'draft' THEN RAISE EXCEPTION 'cutover: config não está em draft'; END IF;
  SELECT event_id INTO ev FROM portal_sites WHERE id = s;
  IF ev IS DISTINCT FROM c.event_id THEN RAISE EXCEPTION 'cutover: site aponta para % e a config para %', ev, c.event_id; END IF;
  SELECT jsonb_object_agg(name, min_points) INTO before FROM club_levels WHERE site_id = s;
  IF before IS DISTINCT FROM p_expected_levels THEN RAISE EXCEPTION 'cutover: níveis atuais % <> esperados %', before, p_expected_levels; END IF;
  IF c.legacy_counts THEN
    INSERT INTO club_legacy_consumption(company_id, site_id, event_id, config_id, member_id, rule_key, points, rows_counted, first_at, last_at)
    SELECT c.company_id, s, c.event_id, c.id, p.member_id, p.rule_key, sum(p.points)::int, count(*)::int, min(p.created_at), max(p.created_at)
      FROM club_points p JOIN club_members cm ON cm.id = p.member_id
     WHERE cm.site_id = s AND p.event_id IS NULL
       AND p.rule_key IN ('join_confirmed','friend_joined','crew_complete','promo_lot_purchase')
       AND NOT EXISTS (SELECT 1 FROM club_points v WHERE v.member_id = p.member_id AND v.rule_key = 'void' AND v.ref_id = p.rule_key || ':' || p.ref_id)
     GROUP BY p.member_id, p.rule_key
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS nl = ROW_COUNT;
    -- Indicados confirmados antes do patch (sem registo de contagem): entram na contagem desta edição.
    INSERT INTO club_referral_events(company_id, site_id, member_id, referee_id, event_id, credited_points, source, created_at)
    SELECT x.company_id, s, x.referred_by_member_id, x.id, c.event_id,
           coalesce((SELECT sum(p.points) FROM club_points p WHERE p.member_id = x.referred_by_member_id AND p.rule_key = 'friend_joined' AND p.ref_id = x.id::text AND p.event_id IS NULL),0)::int,
           'legacy_snapshot', x.confirmed_at
      FROM club_members x
     WHERE x.site_id = s AND x.confirmed_at IS NOT NULL AND x.referred_by_member_id IS NOT NULL AND x.referred_by_member_id <> x.id
    ON CONFLICT (member_id, referee_id) DO NOTHING;
  END IF;
  INSERT INTO club_level_floors(member_id, config_id, company_id, site_id, level_id, level_name, points_at_cutover)
  SELECT cm.id, c.id, cm.company_id, s, l.id, l.name, t.pts
    FROM club_members cm
    CROSS JOIN LATERAL (SELECT coalesce(sum(points),0)::bigint pts FROM club_points WHERE member_id = cm.id) t
    CROSS JOIN LATERAL (SELECT * FROM club_levels l WHERE l.site_id = s AND l.min_points <= t.pts ORDER BY l.min_points DESC LIMIT 1) l
   WHERE cm.site_id = s AND l.min_points > 0
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS nf = ROW_COUNT;
  SELECT count(*) INTO nm FROM club_members WHERE site_id = s;
  FOR k IN SELECT jsonb_object_keys(c.levels) LOOP
    UPDATE club_levels SET min_points = (c.levels->>k)::int WHERE site_id = s AND name = k;
    IF NOT FOUND THEN RAISE EXCEPTION 'cutover: nível % não existe', k; END IF;
  END LOOP;
  SELECT jsonb_object_agg(name, min_points) INTO after FROM club_levels WHERE site_id = s;
  -- Regras visíveis (site, crew_cfg, CRM) = valores que o motor paga. Só as 4 regras aprovadas; as restantes intactas.
  SELECT jsonb_object_agg(rule_key, jsonb_build_object('points', points, 'active', active)) INTO rb FROM club_point_rules WHERE site_id = s;
  UPDATE club_point_rules SET points = CASE rule_key WHEN 'join_confirmed' THEN c.join_points WHEN 'friend_joined' THEN c.referral_points
           WHEN 'crew_complete' THEN c.crew_points WHEN 'promo_lot_purchase' THEN c.purchase_points END
   WHERE site_id = s AND rule_key IN ('join_confirmed','friend_joined','crew_complete','promo_lot_purchase');
  SELECT jsonb_object_agg(rule_key, jsonb_build_object('points', points, 'active', active)) INTO ra FROM club_point_rules WHERE site_id = s;
  UPDATE club_points_config SET status = 'retired' WHERE site_id = s AND status = 'active';
  UPDATE club_points_config SET status = 'active', effective_at = clock_timestamp() WHERE id = c.id;
  INSERT INTO club_points_cutover_log(config_id, company_id, site_id, site_event_id, levels_before, levels_after, rules_before, rules_after,
                                      members_total, floors_created, legacy_rows)
    VALUES (c.id, c.company_id, s, ev, before, after, coalesce(rb,'{}'), coalesce(ra,'{}'), nm, nf, nl);
  RETURN jsonb_build_object('levels_before', before, 'levels_after', after, 'rules_before', rb, 'rules_after', ra,
                            'members', nm, 'floors', nf, 'legacy_rows', nl);
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['_club_site_lock(uuid,boolean)','_club_active_cfg(uuid)','_club_rule_used(uuid,text,uuid)','_club_award_core(uuid,text,text,int,uuid)',
    '_club327_cohesion()','club_award_purchase(uuid)','club_purchase_revoke(uuid,text,text)','club_member_level(uuid)','club_rules_public(uuid)',
    'club_referral_progress(uuid)','club_points_cutover(uuid,jsonb)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
-- Funções existentes (club_award, club_award_fixed, club_confirm_member, club_ranking, club_wallet_due, club_crew_pending):
-- ACL atual mantida (CREATE OR REPLACE não mexe em grants).
-- Paridade com Live: club_award_fixed tem EXECUTE para service_role em Live (0141 só fazia REVOKE). No-op em Live; alinha o repo.
-- Não amplia anon/authenticated.
GRANT EXECUTE ON FUNCTION public.club_award_fixed(uuid, text, text, int) TO service_role;

-- 7) Configuração da edição Newgang 2027 em DRAFT (não muda valores até ao cutover) --------------------------------
INSERT INTO public.club_points_config(company_id, site_id, version, event_id, status, legacy_counts,
  join_points, referral_points, referral_cap, crew_points, purchase_points, purchase_enabled, purchase_lots, levels)
SELECT ps.company_id, ps.id, '2027-v1', '407f43fc-790f-4ea7-8b2a-4162805dfb16', 'draft', true,
       100, 75, 750, 100, 200, false, '{}', '{"Gang":0,"Crew":750,"Goat":3000}'::jsonb
  FROM public.portal_sites ps
 WHERE ps.id = 'f8ce23a5-a27a-4893-9b7a-d6337d84b168' AND ps.event_id = '407f43fc-790f-4ea7-8b2a-4162805dfb16'
ON CONFLICT (site_id, version) DO NOTHING;
