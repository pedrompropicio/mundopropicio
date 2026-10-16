-- #327 — RLS REAL das 6 tabelas novas: SET ROLE authenticated/anon + GUCs de auth; helpers controlados SÓ neste teste.
-- (has_role / row_belongs_to_current_company são stubs locais; aqui leem GUCs para simular papel e empresa ativa.)
\set ON_ERROR_STOP 1
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT _user_id IS NOT NULL AND (',' || coalesce(current_setting('it.roles', true), '') || ',') LIKE ('%,' || _role::text || ',%') $$;
CREATE OR REPLACE FUNCTION public.row_belongs_to_current_company(company_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT company_id::text = coalesce(current_setting('it.company', true), '') $$;
GRANT USAGE ON SCHEMA t TO authenticated, anon;
GRANT INSERT ON t.results TO authenticated, anon; GRANT USAGE ON SEQUENCE t.results_n_seq TO authenticated, anon;
GRANT EXECUTE ON FUNCTION t.ok(text,text,boolean,text) TO authenticated, anon;

-- Empresa B com dados em todas as tabelas novas (como postgres).
INSERT INTO companies(id, name) VALUES ('00000000-0000-4000-8000-0000000000c1', 'Empresa B fictícia');
INSERT INTO events(id, company_id, name) VALUES ('00000000-0000-4000-8000-0000000000ec', '00000000-0000-4000-8000-0000000000c1', 'Edição B');
INSERT INTO portal_sites(id, company_id, domain, event_id, brand_key, active)
  VALUES ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000c1', 'b.example.invalid', '00000000-0000-4000-8000-0000000000ec', 'b', true);
INSERT INTO club_levels(company_id, site_id, name, min_points, benefit)
  SELECT '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', n, p, n FROM (VALUES ('Gang',0),('Crew',500),('Goat',1500)) v(n,p);
INSERT INTO club_point_rules(company_id, site_id, rule_key, label, points)
  VALUES ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000c2','join_confirmed','j',100),
         ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000c2','friend_joined','f',150);
DO $$ DECLARE a uuid; b uuid; BEGIN
  a := t.newc('rlsb1@example.invalid', NULL, '00000000-0000-4000-8000-0000000000c2');
  PERFORM t.seed(a, 600);
  INSERT INTO club_points(company_id, member_id, rule_key, points, ref_id) VALUES ('00000000-0000-4000-8000-0000000000c1', a, 'friend_joined', 150, 'legadoB');
  b := t.newc('rlsb2@example.invalid', t.code(a), '00000000-0000-4000-8000-0000000000c2');
  INSERT INTO club_points_config(company_id, site_id, version, event_id, status, legacy_counts, join_points, referral_points, referral_cap, crew_points, purchase_points, levels)
    VALUES ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000c2','b-v1','00000000-0000-4000-8000-0000000000ec','draft',true,100,75,750,100,200,'{"Gang":0,"Crew":750,"Goat":3000}');
  PERFORM club_points_cutover((SELECT id FROM club_points_config WHERE version='b-v1'), '{"Gang":0,"Crew":500,"Goat":1500}');
  INSERT INTO club_purchase_evidence(company_id, site_id, event_id, member_id, source, order_ref, lot_ref, status, fingerprint)
    VALUES ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000ec', a, 'fever_order','B-1','EB1','valid','fpb1');
  PERFORM t.ok('rls','fixture B: há linhas B nas 6 tabelas',
    (SELECT count(*) FROM club_points_config WHERE company_id='00000000-0000-4000-8000-0000000000c1') > 0 AND
    (SELECT count(*) FROM club_level_floors WHERE company_id='00000000-0000-4000-8000-0000000000c1') > 0 AND
    (SELECT count(*) FROM club_points_cutover_log WHERE company_id='00000000-0000-4000-8000-0000000000c1') > 0 AND
    (SELECT count(*) FROM club_legacy_consumption WHERE company_id='00000000-0000-4000-8000-0000000000c1') > 0 AND
    (SELECT count(*) FROM club_referral_events WHERE company_id='00000000-0000-4000-8000-0000000000c1') > 0 AND
    (SELECT count(*) FROM club_purchase_evidence WHERE company_id='00000000-0000-4000-8000-0000000000c1') > 0);
  -- Coesão: config da empresa A apontada a site B recusada.
  BEGIN
    INSERT INTO club_points_config(company_id, site_id, version, event_id, join_points, referral_points, referral_cap, crew_points, purchase_points, levels)
      VALUES ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000c2','x','00000000-0000-4000-8000-0000000000ec',1,1,1,1,1,'{}');
    PERFORM t.ok('rls','coesão config empresa/site', false);
  EXCEPTION WHEN raise_exception THEN PERFORM t.ok('rls','coesão: config de empresa A em site B recusada', true); END;
END $$;
CREATE TEMP TABLE rls_expect AS
SELECT 'club_points_config' t, (SELECT count(*) FROM club_points_config WHERE company_id='00000000-0000-4000-8000-0000000000a1') a
UNION ALL SELECT 'club_level_floors', (SELECT count(*) FROM club_level_floors WHERE company_id='00000000-0000-4000-8000-0000000000a1')
UNION ALL SELECT 'club_points_cutover_log', (SELECT count(*) FROM club_points_cutover_log WHERE company_id='00000000-0000-4000-8000-0000000000a1')
UNION ALL SELECT 'club_legacy_consumption', (SELECT count(*) FROM club_legacy_consumption WHERE company_id='00000000-0000-4000-8000-0000000000a1')
UNION ALL SELECT 'club_referral_events', (SELECT count(*) FROM club_referral_events WHERE company_id='00000000-0000-4000-8000-0000000000a1')
UNION ALL SELECT 'club_purchase_evidence', (SELECT count(*) FROM club_purchase_evidence WHERE company_id='00000000-0000-4000-8000-0000000000a1');
GRANT SELECT ON rls_expect TO authenticated, anon;

-- Staff da empresa A (admin) — vê só A, e TODAS as de A.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000f1'; SET request.jwt.claim.role = 'authenticated';
SET it.roles = 'admin'; SET it.company = '00000000-0000-4000-8000-0000000000a1';
SET ROLE authenticated;
DO $$ DECLARE r record; na bigint; nb bigint; BEGIN
  FOR r IN SELECT * FROM rls_expect LOOP
    EXECUTE format('SELECT count(*) FILTER (WHERE company_id = %L), count(*) FILTER (WHERE company_id <> %L) FROM public.%I',
                   '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', r.t) INTO na, nb;
    PERFORM t.ok('rls', 'staff A em '||r.t||': vê A ('||r.a||'), 0 de B', na = r.a AND r.a > 0 AND nb = 0, na||'/'||nb);
  END LOOP;
END $$;
-- Staff da empresa B vê B e não A.
SET it.company = '00000000-0000-4000-8000-0000000000c1';
DO $$ DECLARE r record; na bigint; nb bigint; BEGIN
  FOR r IN SELECT * FROM rls_expect LOOP
    EXECUTE format('SELECT count(*) FILTER (WHERE company_id = %L), count(*) FILTER (WHERE company_id <> %L) FROM public.%I',
                   '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c1', r.t) INTO nb, na;
    PERFORM t.ok('rls', 'staff B em '||r.t||': vê B, 0 de A', nb > 0 AND na = 0, nb||'/'||na);
  END LOOP;
END $$;
-- Autenticado da empresa A SEM papel de escrita no portal → 0.
SET it.roles = 'viewer'; SET it.company = '00000000-0000-4000-8000-0000000000a1';
DO $$ DECLARE r record; n bigint; BEGIN
  FOR r IN SELECT * FROM rls_expect LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.t) INTO n;
    PERFORM t.ok('rls', 'sem permissão em '||r.t||': 0', n = 0, n::text);
  END LOOP;
END $$;
-- Escrita direta por authenticated (mesmo admin) recusada: sem GRANT de escrita.
SET it.roles = 'admin';
DO $$ BEGIN
  BEGIN UPDATE public.club_points_config SET purchase_enabled = true; PERFORM t.ok('rls','escrita direta recusada', false);
  EXCEPTION WHEN insufficient_privilege THEN PERFORM t.ok('rls','authenticated admin não escreve config (sem GRANT)', true); END;
END $$;
RESET ROLE;
-- anon: sem GRANT → erro de permissão em todas.
SET request.jwt.claim.role = 'anon'; SET request.jwt.claim.sub = '';
SET ROLE anon;
DO $$ DECLARE t0 text; ok boolean; BEGIN
  FOREACH t0 IN ARRAY ARRAY['club_points_config','club_level_floors','club_points_cutover_log','club_legacy_consumption','club_referral_events','club_purchase_evidence'] LOOP
    ok := false;
    BEGIN EXECUTE format('SELECT count(*) FROM public.%I', t0); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
    PERFORM t.ok('rls', 'anon em '||t0||': sem acesso', ok);
  END LOOP;
END $$;
RESET ROLE;
-- Controlo negativo: a política antiga (só portal_can_write) deixa staff A ler B → o teste deteta a fuga.
CREATE POLICY neg_old ON public.club_purchase_evidence FOR SELECT TO authenticated USING (public.portal_can_write());
SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000f1';
SET it.roles = 'admin'; SET it.company = '00000000-0000-4000-8000-0000000000a1';
SET ROLE authenticated;
DO $$ DECLARE nb bigint; BEGIN
  SELECT count(*) INTO nb FROM public.club_purchase_evidence WHERE company_id <> '00000000-0000-4000-8000-0000000000a1';
  PERFORM t.ok('rls_controlo_negativo', 'com a política antiga, staff A VÊ provas de B (fuga detetável)', nb > 0, nb::text);
END $$;
RESET ROLE;
DROP POLICY neg_old ON public.club_purchase_evidence;
RESET request.jwt.claim.sub; RESET request.jwt.claim.role; RESET it.roles; RESET it.company;
-- Repõe os stubs (false) para o resto da bateria.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.row_belongs_to_current_company(company_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
SELECT 'RLS327 ' || count(*) FILTER (WHERE ok AND phase LIKE 'rls%') || '/' || count(*) FILTER (WHERE phase LIKE 'rls%') FROM t.results;
