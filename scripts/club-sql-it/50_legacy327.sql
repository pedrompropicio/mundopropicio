-- #327 — Fixtures LEGADO criadas com as funções Live (pós-0176), ANTES de carregar o pendente.
-- Dados 100% sintéticos (@example.invalid, UUIDs fixos de teste). Base local descartável.
\set ON_ERROR_STOP 1
CREATE SCHEMA t;
CREATE TABLE t.results (n serial, phase text, name text, ok boolean, detail text);
CREATE FUNCTION t.ok(p_phase text, p_name text, p_cond boolean, p_detail text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t.results(phase, name, ok, detail) VALUES (p_phase, p_name, coalesce(p_cond,false), p_detail);
  IF NOT coalesce(p_cond,false) THEN RAISE EXCEPTION 'ASSERT FALHOU [%] % — %', p_phase, p_name, p_detail; END IF;
END $$;
CREATE FUNCTION t.pts(p uuid) RETURNS int LANGUAGE sql AS $$ SELECT coalesce(sum(points),0)::int FROM public.club_points WHERE member_id = p $$;
CREATE FUNCTION t.rp(p_rule text, p uuid) RETURNS int LANGUAGE sql AS $$ SELECT coalesce(sum(points),0)::int FROM public.club_points WHERE member_id = p AND rule_key = p_rule $$;
CREATE FUNCTION t.cnt(p_rule text, p uuid) RETURNS int LANGUAGE sql AS $$ SELECT count(*)::int FROM public.club_points WHERE member_id = p AND rule_key = p_rule $$;
CREATE FUNCTION t.code(p uuid) RETURNS text LANGUAGE sql AS $$ SELECT referral_code FROM public.club_members WHERE id = p $$;
CREATE FUNCTION t.m(p_email text, p_site uuid DEFAULT '00000000-0000-4000-8000-0000000000a2') RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.club_members WHERE site_id = p_site AND lower(email) = lower(p_email) $$;
CREATE FUNCTION t.new(p_email text, p_ref text DEFAULT NULL, p_site uuid DEFAULT '00000000-0000-4000-8000-0000000000a2') RETURNS uuid LANGUAGE sql AS $$
  SELECT public.club_upsert_member(p_site, p_email, 'Teste', NULL, NULL, p_ref, 'formulario') $$;
CREATE FUNCTION t.newc(p_email text, p_ref text DEFAULT NULL, p_site uuid DEFAULT '00000000-0000-4000-8000-0000000000a2') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE m uuid := t.new(p_email, p_ref, p_site); BEGIN PERFORM public.club_confirm_member(m); RETURN m; END $$;
-- Pontos de fixture para testar limiares (regra técnica 'seed_fixture', só local).
CREATE FUNCTION t.seed(p uuid, p_pts int) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.club_points(company_id, member_id, rule_key, points, ref_id)
  SELECT company_id, id, 'seed_fixture', p_pts, gen_random_uuid()::text FROM public.club_members WHERE id = p $$;
CREATE TABLE t.snap (k text PRIMARY KEY, v text);

INSERT INTO public.companies(id, name) VALUES ('00000000-0000-4000-8000-0000000000a1', 'Empresa fictícia #327');
INSERT INTO public.events(id, company_id, name) VALUES
 ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 'Edição fictícia 1'),
 ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a1', 'Edição fictícia 2'),
 ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-0000000000a1', 'Outro site');
INSERT INTO public.portal_sites(id, company_id, domain, event_id, brand_key, active) VALUES
 ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1', 'ng.example.invalid', '00000000-0000-4000-8000-0000000000e1', 'newgang', true),
 ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'outro.example.invalid', '00000000-0000-4000-8000-0000000000e9', 'outro', true);
-- Regras = valores Live atuais (lidos por SELECT): 100/150/300/500/50/100/200 (4..6).
INSERT INTO public.club_point_rules(company_id, site_id, rule_key, label, points, min_members, max_members)
SELECT '00000000-0000-4000-8000-0000000000a1', s, r.k, r.k, r.p, r.mi, r.ma
  FROM unnest(ARRAY['00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000b2']::uuid[]) s,
  (VALUES ('join_confirmed',100,NULL::int,NULL::int),('friend_joined',150,NULL,NULL),('friend_bought',300,NULL,NULL),
          ('promo_lot_purchase',500,NULL,NULL),('guess_correct',50,NULL,NULL),('attended_year',100,NULL,NULL),('crew_complete',200,4,6)) r(k,p,mi,ma);
INSERT INTO public.club_levels(company_id, site_id, name, min_points, benefit)
SELECT '00000000-0000-4000-8000-0000000000a1', s, l.n, l.p, l.n
  FROM unnest(ARRAY['00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000b2']::uuid[]) s,
  (VALUES ('Gang',0),('Crew',500),('Goat',1500)) l(n,p);

-- Legado (regras atuais): indicadores com 1, 5 e 10 amigos (150 cada), Crew 200 já ganho, níveis 500/1499/1500/2999.
DO $$ DECLARE l1 uuid; l5 uuid; l10 uuid; c uuid; i int; m uuid; j jsonb; BEGIN
  l1 := t.newc('legacy1@example.invalid'); l5 := t.newc('legacy5@example.invalid'); l10 := t.newc('legacy10@example.invalid');
  PERFORM t.newc('l1f1@example.invalid', t.code(l1));
  FOR i IN 1..5 LOOP PERFORM t.newc('l5f'||i||'@example.invalid', t.code(l5)); END LOOP;
  FOR i IN 1..10 LOOP PERFORM t.newc('l10f'||i||'@example.invalid', t.code(l10)); END LOOP;
  PERFORM t.ok('legado','1 amigo = 150', t.rp('friend_joined', l1) = 150);
  PERFORM t.ok('legado','5 amigos = 750', t.rp('friend_joined', l5) = 750);
  PERFORM t.ok('legado','10 amigos = 1500', t.rp('friend_joined', l10) = 1500);
  -- Crew legado completa (4) → 200 a cada.
  c := (public.club_crew_create(t.newc('lcrew1@example.invalid'), 'Crew Legado')->>'id')::uuid;
  FOR i IN 2..4 LOOP
    m := t.newc('lcrew'||i||'@example.invalid');
    j := public.club_crew_join(m, (SELECT code FROM club_crews WHERE id = c));
  END LOOP;
  PERFORM t.ok('legado','Crew legado 200', t.rp('crew_complete', t.m('lcrew1@example.invalid')) = 200);
  -- Níveis.
  m := t.newc('lv500@example.invalid');  PERFORM t.seed(m, 400);
  m := t.newc('lv1499@example.invalid'); PERFORM t.seed(m, 1399);
  m := t.newc('lv1500@example.invalid'); PERFORM t.seed(m, 1400);
  m := t.newc('lv2999@example.invalid'); PERFORM t.seed(m, 2899);
  m := t.newc('lv499@example.invalid');  PERFORM t.seed(m, 399);
  PERFORM t.ok('legado','limiares fixture', t.pts(t.m('lv500@example.invalid')) = 500 AND t.pts(t.m('lv1499@example.invalid')) = 1499
     AND t.pts(t.m('lv1500@example.invalid')) = 1500 AND t.pts(t.m('lv2999@example.invalid')) = 2999 AND t.pts(t.m('lv499@example.invalid')) = 499);
  -- Mesma pessoa no outro site.
  PERFORM t.newc('legacy1@example.invalid', NULL, '00000000-0000-4000-8000-0000000000b2');
  -- Membro inscrito (não confirmado) antes do patch, indicado por legacy1.
  PERFORM t.new('pre_pending@example.invalid', t.code(l1));
END $$;
INSERT INTO t.snap SELECT 'points', count(*)||'/'||sum(points)||'/'||md5(string_agg(id::text||member_id||rule_key||points||ref_id, ',' ORDER BY id)) FROM public.club_points;
INSERT INTO t.snap SELECT 'members', count(*)||'/'||md5(string_agg(id::text||coalesce(referred_by_member_id::text,'')||coalesce(confirmed_at::text,''), ',' ORDER BY id)) FROM public.club_members;
CREATE TABLE t.legacy AS SELECT id, member_id, rule_key, points, ref_id, created_at FROM public.club_points;
SELECT 'LEGADO_OK ' || (SELECT v FROM t.snap WHERE k='points');
-- Pré-patch: saídas dos consumidores para comparar depois de carregar o pendente (impacto pré-cutover).
INSERT INTO public.club_wallet_passes(company_id, member_id, platform, object_id, last_points, last_level)
SELECT company_id, id, 'google', 'obj.pre.'||member_no, 0, 'Gang' FROM public.club_members WHERE email IN ('lv1500@example.invalid','legacy5@example.invalid');
INSERT INTO t.snap SELECT 'ranking', md5(string_agg(member_id||':'||points||':'||coalesce(level_name,'-')||':'||rank_pos, ',' ORDER BY rank_pos, member_id))
  FROM public.club_ranking('00000000-0000-4000-8000-0000000000a2', 100000);
INSERT INTO t.snap SELECT 'wallet', md5(string_agg(member_id||':'||points||':'||coalesce(level_name,'-'), ',' ORDER BY member_id)) FROM public.club_wallet_due(1000);
INSERT INTO t.snap SELECT 'rules', md5(string_agg(site_id||rule_key||points||active, ',' ORDER BY site_id, rule_key)) FROM public.club_point_rules;
INSERT INTO t.snap SELECT 'crewcfg', (SELECT pts||'/'||min_m||'/'||max_m FROM public.club_crew_cfg('00000000-0000-4000-8000-0000000000a2'));
