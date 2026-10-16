-- #326 — Cenário SERIAL com as funções canónicas do Clube (verbatim das migrações, hash = Live).
-- Dados 100% sintéticos (@example.invalid, UUIDs fixos de teste). Base local descartável.
\set ON_ERROR_STOP 1
CREATE SCHEMA it;
CREATE TABLE it.results (n serial, phase text, name text, ok boolean, detail text);
CREATE FUNCTION it.ok(p_phase text, p_name text, p_cond boolean, p_detail text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO it.results(phase, name, ok, detail) VALUES (p_phase, p_name, coalesce(p_cond,false), p_detail);
  IF NOT coalesce(p_cond,false) THEN RAISE EXCEPTION 'ASSERT FALHOU [%] % — %', p_phase, p_name, p_detail; END IF;
END $$;
CREATE FUNCTION it.pts(p uuid) RETURNS int LANGUAGE sql AS $$ SELECT coalesce(sum(points),0)::int FROM public.club_points WHERE member_id = p $$;
CREATE FUNCTION it.n(p_rule text, p uuid) RETURNS int LANGUAGE sql AS $$ SELECT count(*)::int FROM public.club_points WHERE member_id = p AND rule_key = p_rule $$;
CREATE FUNCTION it.m(p_email text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.club_members WHERE lower(email) = lower(p_email) $$;
CREATE FUNCTION it.code(p uuid) RETURNS text LANGUAGE sql AS $$ SELECT referral_code FROM public.club_members WHERE id = p $$;
CREATE FUNCTION it.new(p_email text, p_ref text DEFAULT NULL, p_phone text DEFAULT NULL) RETURNS uuid LANGUAGE sql AS $$
  SELECT public.club_upsert_member('00000000-0000-4000-8000-0000000000a2', p_email, 'Teste', p_phone, NULL, p_ref, 'formulario') $$;
CREATE FUNCTION it.newc(p_email text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE m uuid := it.new(p_email); BEGIN PERFORM public.club_confirm_member(m); RETURN m; END $$;

-- Fixtures: empresa, evento, site, regras (configuração da fixture = valores de Live documentados).
INSERT INTO public.companies(id, name) VALUES ('00000000-0000-4000-8000-0000000000a1', 'Empresa fictícia #326');
INSERT INTO public.events(id, company_id, name) VALUES ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a1', 'Evento fictício');
INSERT INTO public.portal_sites(id, company_id, domain, event_id, brand_key, active)
VALUES ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1', 'ng.example.invalid', '00000000-0000-4000-8000-0000000000a3', 'newgang', true);
INSERT INTO public.club_point_rules(company_id, site_id, rule_key, label, points, min_members, max_members) VALUES
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2','join_confirmed','Confirmar',100,NULL,NULL),
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2','friend_joined','Amigo confirmou',150,NULL,NULL),
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2','crew_complete','Crew completa',200,4,6);

-- A. Indicação
DO $$ DECLARE a uuid; b uuid; x uuid; BEGIN
  a := it.new('a@example.invalid');
  PERFORM it.ok('indicacao','A criado por confirmar', (SELECT confirmed_at IS NULL FROM club_members WHERE id=a));
  PERFORM it.ok('indicacao','sem pontos antes de confirmar', it.pts(a) = 0);
  PERFORM club_confirm_member(a);
  PERFORM it.ok('indicacao','A confirma => +100', it.pts(a) = 100, it.pts(a)::text);
  b := it.new('b@example.invalid', lower(' '||it.code(a)||' '));
  PERFORM it.ok('indicacao','B ligado a A (código normalizado)', (SELECT referred_by_member_id FROM club_members WHERE id=b) = a);
  PERFORM it.ok('indicacao','convidador sem crédito antes de B confirmar', it.pts(a) = 100);
  PERFORM club_confirm_member(b);
  PERFORM it.ok('indicacao','B confirma => B +100', it.pts(b) = 100);
  PERFORM it.ok('indicacao','B confirma => A +150', it.pts(a) = 250, it.pts(a)::text);
  PERFORM club_confirm_member(b); PERFORM club_confirm_member(b);
  PERFORM it.ok('indicacao','confirmação repetida idempotente (B)', it.pts(b) = 100 AND it.n('join_confirmed', b) = 1);
  PERFORM it.ok('indicacao','confirmação repetida idempotente (A)', it.pts(a) = 250 AND it.n('friend_joined', a) = 1);
  -- Pessoa existente não muda indicação.
  x := it.newc('x@example.invalid');
  PERFORM it.ok('indicacao','reinscrição devolve o mesmo membro', it.new('B@Example.Invalid ', it.code(x)) = b);
  PERFORM it.ok('indicacao','existente não muda indicação', (SELECT referred_by_member_id FROM club_members WHERE id=b) = a);
  PERFORM it.ok('indicacao','existente não credita novo convidador', it.n('friend_joined', x) = 0);
  -- Autoindicação.
  PERFORM it.ok('indicacao','autoindicação devolve o próprio', it.new('a@example.invalid', it.code(a)) = a);
  PERFORM it.ok('indicacao','autoindicação não grava ref', (SELECT referred_by_member_id FROM club_members WHERE id=a) IS NULL);
  PERFORM club_confirm_member(a);
  PERFORM it.ok('indicacao','autoindicação não credita', it.pts(a) = 250 AND it.n('friend_joined', a) = 1);
  -- Código inválido.
  x := it.new('inv@example.invalid', 'ZZZZZZZ');
  PERFORM it.ok('indicacao','código de indicação inválido => sem ref', (SELECT referred_by_member_id FROM club_members WHERE id=x) IS NULL);
  -- Correspondência por telefone.
  x := it.new('tel1@example.invalid', NULL, '+351900000001');
  PERFORM it.ok('indicacao','mesmo telefone, email novo => mesmo membro (regra atual)', it.new('tel2@example.invalid', it.code(a), '+351900000001') = x);
  -- Email vazio / site inexistente.
  PERFORM it.ok('indicacao','email vazio => NULL', it.new('  ') IS NULL);
  PERFORM it.ok('indicacao','site inexistente => NULL', club_upsert_member(gen_random_uuid(), 'q@example.invalid', NULL, NULL, NULL, NULL, 'formulario') IS NULL);
END $$;

-- B. Crew: limites, bónus, duplicação
DO $$ DECLARE a uuid := it.m('a@example.invalid'); b uuid := it.m('b@example.invalid'); c3 uuid; d uuid; e uuid; f uuid; g uuid; u uuid;
  r jsonb; crew uuid; code text; BEGIN
  u := it.new('unconf@example.invalid');
  PERFORM it.ok('crew','não confirmado não cria', club_crew_create(u, 'Gang Teste')->>'error' = 'no_session');
  PERFORM it.ok('crew','nome curto recusado', club_crew_create(a, 'x')->>'error' = 'crew_name');
  PERFORM it.ok('crew','nome ofensivo recusado', club_crew_create(a, 'Merda Gang')->>'error' = 'crew_name');
  r := club_crew_create(a, '  A   Gang ');
  crew := (r->>'id')::uuid; code := r->>'code';
  PERFORM it.ok('crew','criação devolve nome normalizado', r->>'name' = 'A Gang', r::text);
  PERFORM it.ok('crew','criador conta como membro', (SELECT count(*) FROM club_crew_members WHERE crew_id=crew) = 1);
  PERFORM it.ok('crew','criador já em crew não cria outra', club_crew_create(a, 'Outra')->>'error' = 'already_in_crew');
  PERFORM it.ok('crew','código inválido', club_crew_join(b, 'NOPE00')->>'error' = 'crew_not_found');
  PERFORM it.ok('crew','não confirmado não entra', club_crew_join(u, code)->>'error' = 'no_session');
  PERFORM club_crew_join(b, lower(code));
  PERFORM it.ok('crew','2 membros: incompleta', (SELECT completed_at IS NULL FROM club_crews WHERE id=crew) AND it.n('crew_complete', a) = 0);
  c3 := it.newc('c3@example.invalid'); PERFORM club_crew_join(c3, code);
  PERFORM it.ok('crew','3 membros: incompleta, sem bónus', (SELECT completed_at IS NULL FROM club_crews WHERE id=crew)
     AND (SELECT count(*) FROM club_points WHERE rule_key='crew_complete') = 0);
  d := it.newc('d@example.invalid'); PERFORM club_crew_join(d, code);
  PERFORM it.ok('crew','4.º confirmado: completa', (SELECT completed_at IS NOT NULL FROM club_crews WHERE id=crew));
  PERFORM it.ok('crew','bónus 200 a cada um dos 4',
     (SELECT count(*) FROM club_points WHERE rule_key='crew_complete' AND ref_id=crew::text AND points=200) = 4
     AND it.n('crew_complete', a)=1 AND it.n('crew_complete', b)=1 AND it.n('crew_complete', c3)=1 AND it.n('crew_complete', d)=1);
  e := it.newc('e@example.invalid'); PERFORM club_crew_join(e, code);
  f := it.newc('f@example.invalid'); PERFORM club_crew_join(f, code);
  PERFORM it.ok('crew','5.º e 6.º ganham uma vez', it.n('crew_complete', e)=1 AND it.n('crew_complete', f)=1
     AND (SELECT count(*) FROM club_points WHERE rule_key='crew_complete' AND ref_id=crew::text) = 6);
  g := it.newc('g@example.invalid');
  PERFORM it.ok('crew','7.º recusado (crew_full)', club_crew_join(g, code)->>'error' = 'crew_full');
  PERFORM it.ok('crew','entrada duplicada recusada', club_crew_join(e, code)->>'error' = 'already_in_crew');
  PERFORM club_crew_check(crew); PERFORM club_crew_check(crew);
  PERFORM it.ok('crew','check repetido não duplica crédito', (SELECT count(*) FROM club_points WHERE rule_key='crew_complete' AND ref_id=crew::text) = 6);
  PERFORM it.ok('crew','pontos A = 100+150+200', it.pts(a) = 450, it.pts(a)::text);
END $$;

-- C. Saída / reentrada / mudança de Crew / dono (caracteriza a regra ATUAL; nada corrigido)
DO $$ DECLARE a uuid := it.m('a@example.invalid'); b uuid := it.m('b@example.invalid'); e uuid := it.m('e@example.invalid');
  g uuid := it.m('g@example.invalid'); crew uuid; code text; r jsonb; crew2 uuid; code2 text; s uuid; BEGIN
  SELECT id, c.code INTO crew, code FROM club_crews c WHERE owner_member_id = a;
  PERFORM it.ok('saida','sair fora de crew', club_crew_leave(g)->>'error' = 'not_in_crew');
  PERFORM it.ok('saida','E sai', (club_crew_leave(e)->>'ok')::boolean);
  PERFORM it.ok('saida','sair não retira pontos', it.n('crew_complete', e) = 1 AND it.pts(e) = 300);
  PERFORM it.ok('saida','vaga libertada: G entra', club_crew_join(g, code) ? 'crew_id');
  PERFORM it.ok('saida','G (entrada após completa) recebe 200', it.n('crew_complete', g) = 1);
  PERFORM club_crew_leave(g);
  PERFORM club_crew_join(e, code);
  PERFORM it.ok('saida','reentrada na mesma crew não repete bónus (ref = crew)', it.n('crew_complete', e) = 1);
  -- Mudança de Crew: E sai e funda crew2 com 3 novos; bónus de crew2 é ref diferente.
  PERFORM club_crew_leave(e);
  r := club_crew_create(e, 'Segunda Gang'); crew2 := (r->>'id')::uuid; code2 := r->>'code';
  FOR s IN SELECT it.newc(x) FROM unnest(ARRAY['h1@example.invalid','h2@example.invalid','h3@example.invalid']) x LOOP
    PERFORM club_crew_join(s, code2);
  END LOOP;
  PERFORM it.ok('saida','REGRA ATUAL: mudar de crew volta a dar bónus (sem limite por edição)',
    it.n('crew_complete', e) = 2 AND it.pts(e) = 500, 'pts E='||it.pts(e));
  -- Dono
  PERFORM it.ok('dono','dono com membros sem novo dono => owner_transfer', club_crew_leave(a)->>'error' = 'owner_transfer');
  PERFORM it.ok('dono','novo dono fora da crew recusado', club_crew_leave(a, g)->>'error' = 'owner_transfer');
  PERFORM it.ok('dono','transferência para B', (club_crew_leave(a, b)->>'ok')::boolean AND (SELECT owner_member_id FROM club_crews WHERE id=crew) = b);
  PERFORM it.ok('dono','A saiu e mantém pontos', it.pts(a) = 450);
  -- Último a sair apaga a crew (pontos ficam).
  r := club_crew_create(g, 'Solo Gang');
  PERFORM club_crew_leave(g);
  PERFORM it.ok('dono','último a sair apaga a crew', NOT EXISTS (SELECT 1 FROM club_crews WHERE id = (r->>'id')::uuid));
END $$;

-- D. Captura (trigger real em lead_capture, local, sem rede): par ref+crew guardado até confirmar.
DO $$ DECLARE a uuid := it.m('a@example.invalid'); e uuid := it.m('e@example.invalid'); code2 text; h uuid; lc uuid; k uuid; w uuid;
  base int; crew2 uuid; BEGIN
  SELECT id, code INTO crew2, code2 FROM club_crews WHERE owner_member_id = e;
  PERFORM club_crew_leave(it.m('h3@example.invalid'));  -- abre vaga (crew2 fica com 3)
  base := it.pts(a);
  INSERT INTO lead_capture(id, company_id, source, email, name, raw)
  VALUES (gen_random_uuid(), '00000000-0000-4000-8000-0000000000a1', 'clube_newgang', 'cap@example.invalid', 'Cap Teste',
          jsonb_build_object('referral_code', it.code(a), 'crew_code', lower(code2))) RETURNING id INTO lc;
  PERFORM it.ok('captura','antes de processed nada acontece', it.m('cap@example.invalid') IS NULL);
  UPDATE lead_capture SET processed = true WHERE id = lc;
  h := it.m('cap@example.invalid');
  PERFORM it.ok('captura','processed=true cria membro (trigger)', h IS NOT NULL);
  PERFORM it.ok('captura','ref guardada', (SELECT referred_by_member_id FROM club_members WHERE id=h) = a);
  PERFORM it.ok('captura','crew guardada como pendente (maiúsculas)', (SELECT pending_crew_code FROM club_members WHERE id=h) = code2);
  PERFORM it.ok('captura','nada creditado antes de confirmar', it.pts(h) = 0 AND it.pts(a) = base
     AND NOT EXISTS (SELECT 1 FROM club_crew_members WHERE member_id = h));
  PERFORM club_confirm_member(h);
  PERFORM it.ok('captura','confirmar aplica crew e limpa pendente', EXISTS (SELECT 1 FROM club_crew_members WHERE member_id=h AND crew_id=crew2)
     AND (SELECT pending_crew_code FROM club_members WHERE id=h) IS NULL);
  PERFORM it.ok('captura','confirmar credita +100 próprio, +150 A, +200 crew completa', it.pts(h) = 300 AND it.pts(a) = base + 150, 'h='||it.pts(h));
  -- Código de crew malformado na captura: não guarda.
  INSERT INTO lead_capture(company_id, source, email, raw) VALUES ('00000000-0000-4000-8000-0000000000a1','clube_newgang','cap2@example.invalid','{"crew_code":"bad!"}') RETURNING id INTO lc;
  UPDATE lead_capture SET processed = true WHERE id = lc;
  PERFORM it.ok('captura','crew_code malformado ignorado', (SELECT pending_crew_code FROM club_members WHERE id=it.m('cap2@example.invalid')) IS NULL);
  -- Membro já confirmado com crew_code: entra logo.
  k := it.newc('cap3@example.invalid');
  INSERT INTO lead_capture(company_id, source, email, raw) VALUES ('00000000-0000-4000-8000-0000000000a1','clube_newgang','cap3@example.invalid', jsonb_build_object('crew_code', code2)) RETURNING id INTO lc;
  UPDATE lead_capture SET processed = true WHERE id = lc;
  PERFORM it.ok('captura','confirmado com crew_code entra logo', EXISTS (SELECT 1 FROM club_crew_members WHERE member_id=k AND crew_id=crew2));
  -- Crew cheia no momento da confirmação: aviso, pendente limpo, sem crew (regra atual).
  PERFORM club_crew_join(it.newc('fill@example.invalid'), code2);  -- crew2 = 6
  INSERT INTO lead_capture(company_id, source, email, raw) VALUES ('00000000-0000-4000-8000-0000000000a1','clube_newgang','late@example.invalid', jsonb_build_object('crew_code', code2)) RETURNING id INTO lc;
  UPDATE lead_capture SET processed = true WHERE id = lc;
  w := it.m('late@example.invalid'); PERFORM club_confirm_member(w);
  PERFORM it.ok('captura','REGRA ATUAL: crew cheia ao confirmar => sem crew e pendente apagado',
     NOT EXISTS (SELECT 1 FROM club_crew_members WHERE member_id=w) AND (SELECT pending_crew_code FROM club_members WHERE id=w) IS NULL AND it.pts(w) = 100);
  -- Outra fonte não cria membro.
  INSERT INTO lead_capture(company_id, source, email) VALUES ('00000000-0000-4000-8000-0000000000a1','portal_mp','other@example.invalid') RETURNING id INTO lc;
  UPDATE lead_capture SET processed = true WHERE id = lc;
  PERFORM it.ok('captura','fonte diferente não cria membro', it.m('other@example.invalid') IS NULL);
END $$;

-- E. Invariantes globais
DO $$ BEGIN
  PERFORM it.ok('invariante','nenhuma crew > 6', NOT EXISTS (SELECT 1 FROM club_crew_members GROUP BY crew_id HAVING count(*) > 6));
  PERFORM it.ok('invariante','sem pontos duplicados por (membro, regra, ref)', NOT EXISTS (SELECT 1 FROM club_points GROUP BY member_id, rule_key, ref_id HAVING count(*) > 1));
  PERFORM it.ok('invariante','sem pontos a não confirmados', NOT EXISTS (SELECT 1 FROM club_points p JOIN club_members m ON m.id=p.member_id WHERE m.confirmed_at IS NULL));
  PERFORM it.ok('invariante','member_no único e contínuo', (SELECT count(DISTINCT member_no) = count(*) AND max(member_no) = count(*) FROM club_members));
  PERFORM it.ok('invariante','todos os emails sintéticos', NOT EXISTS (SELECT 1 FROM club_members WHERE email NOT LIKE '%@example.invalid'));
END $$;

\pset format unaligned
\pset tuples_only on
SELECT 'SERIAL_RESULT ' || json_build_object('total', count(*), 'passed', count(*) FILTER (WHERE ok))::text FROM it.results;
\o /dev/null
