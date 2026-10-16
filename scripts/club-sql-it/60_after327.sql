-- #327 — Depois de carregar o pendente: (1) inerte antes do cutover; (2) cutover; (3) regras novas; (4) nova edição.
\set ON_ERROR_STOP 1
-- 1) Pendente carregado: dados intactos, config em draft, motor com os valores atuais.
DO $$ DECLARE a uuid; b uuid; BEGIN
  PERFORM t.ok('inerte','club_points intacto', (SELECT v FROM t.snap WHERE k='points') =
     (SELECT count(*)||'/'||sum(points)||'/'||md5(string_agg(id::text||member_id||rule_key||points||ref_id, ',' ORDER BY id)) FROM club_points));
  PERFORM t.ok('inerte','membros intactos', (SELECT v FROM t.snap WHERE k='members') =
     (SELECT count(*)||'/'||md5(string_agg(id::text||coalesce(referred_by_member_id::text,'')||coalesce(confirmed_at::text,''), ',' ORDER BY id)) FROM club_members));
  PERFORM t.ok('inerte','créditos antigos sem edição (NULL, sem inferência)', (SELECT count(*) FROM club_points WHERE event_id IS NOT NULL) = 0);
  PERFORM t.ok('inerte','níveis inalterados', (SELECT jsonb_object_agg(name,min_points) FROM club_levels WHERE site_id='00000000-0000-4000-8000-0000000000a2') = '{"Gang":0,"Crew":500,"Goat":1500}');
  PERFORM t.ok('inerte','sem config ativa', (SELECT count(*) FROM club_points_config WHERE status='active') = 0);
  a := t.newc('pre1@example.invalid'); b := t.newc('pre2@example.invalid', t.code(a));
  PERFORM t.ok('inerte','antes do cutover: inscrição 100 e indicação 150 (regra atual)', t.pts(b) = 100 AND t.rp('friend_joined', a) = 150);
  PERFORM t.ok('inerte','antes do cutover: crédito novo já grava a edição do site', (SELECT bool_and(event_id = '00000000-0000-4000-8000-0000000000e1') FROM club_points WHERE member_id IN (a,b)));
  PERFORM t.ok('inerte','compra genérica antes do cutover segue regra atual (sem chamadores reais)', public.club_award(a, 'promo_lot_purchase', 'x') = 500);
  PERFORM _club_points_void_row((SELECT p FROM club_points p WHERE member_id = a AND rule_key='promo_lot_purchase'), 'fixture: anular teste');
  PERFORM t.ok('inerte','nível canónico = nível por pontos antes do cutover', (SELECT level_name FROM club_member_level(t.m('lv500@example.invalid'))) = 'Crew');
END $$;

-- Config da fixture (mesmos valores aprovados; evento fictício e1).
INSERT INTO club_points_config(company_id, site_id, version, event_id, status, legacy_counts, join_points, referral_points, referral_cap,
  crew_points, purchase_points, purchase_enabled, purchase_lots, levels)
VALUES ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2','e1-v1','00000000-0000-4000-8000-0000000000e1','draft',true,
  100,75,750,100,200,false,'{}','{"Gang":0,"Crew":750,"Goat":3000}');

-- 2) Cutover: guarda de níveis esperados; pisos; troca atómica.
DO $$ DECLARE r jsonb; ok boolean := false; BEGIN
  BEGIN PERFORM club_points_cutover((SELECT id FROM club_points_config WHERE version='e1-v1'), '{"Gang":0,"Crew":750,"Goat":3000}');
  EXCEPTION WHEN raise_exception THEN ok := true; END;
  PERFORM t.ok('cutover','recusa se os níveis atuais não forem os esperados', ok);
  r := club_points_cutover((SELECT id FROM club_points_config WHERE version='e1-v1'), '{"Gang":0,"Crew":500,"Goat":1500}');
  PERFORM t.ok('cutover','níveis novos 750/3000', (SELECT jsonb_object_agg(name,min_points) FROM club_levels WHERE site_id='00000000-0000-4000-8000-0000000000a2') = '{"Gang":0,"Crew":750,"Goat":3000}', r::text);
  PERFORM t.ok('cutover','outro site intacto', (SELECT jsonb_object_agg(name,min_points) FROM club_levels WHERE site_id='00000000-0000-4000-8000-0000000000b2') = '{"Gang":0,"Crew":500,"Goat":1500}');
  PERFORM t.ok('cutover','club_points intacto no cutover (sem editar/apagar/recalcular)', NOT EXISTS (SELECT * FROM t.legacy EXCEPT SELECT id, member_id, rule_key, points, ref_id, created_at FROM club_points WHERE event_id IS NULL));
  ok := false;
  BEGIN PERFORM club_points_cutover((SELECT id FROM club_points_config WHERE version='e1-v1'), '{"Gang":0,"Crew":750,"Goat":3000}');
  EXCEPTION WHEN raise_exception THEN ok := true; END;
  PERFORM t.ok('cutover','cutover repetido recusado', ok);
END $$;

-- 3) Níveis canónicos com piso.
DO $$ BEGIN
  PERFORM t.ok('niveis','500 → Crew protegido', (SELECT level_name||protected FROM club_member_level(t.m('lv500@example.invalid'))) = 'Crewtrue');
  PERFORM t.ok('niveis','1499 → Crew (por pontos ≥750; piso Crew igual)', (SELECT level_name||protected FROM club_member_level(t.m('lv1499@example.invalid'))) = 'Crewfalse');
  PERFORM t.ok('niveis','1500 → Goat protegido', (SELECT level_name||protected FROM club_member_level(t.m('lv1500@example.invalid'))) = 'Goattrue');
  PERFORM t.ok('niveis','2999 → Goat protegido', (SELECT level_name||protected FROM club_member_level(t.m('lv2999@example.invalid'))) = 'Goattrue');
  PERFORM t.ok('niveis','499 → Gang (sem piso)', (SELECT level_name||protected FROM club_member_level(t.m('lv499@example.invalid'))) = 'Gangfalse');
  PERFORM t.ok('niveis','legacy10 (1600) → Goat protegido', (SELECT level_name FROM club_member_level(t.m('legacy10@example.invalid'))) = 'Goat');
  PERFORM t.seed(t.m('lv499@example.invalid'), 251);
  PERFORM t.ok('niveis','750 depois do cutover → Crew por pontos', (SELECT level_name||protected FROM club_member_level(t.m('lv499@example.invalid'))) = 'Crewfalse');
  PERFORM t.seed(t.m('lv1499@example.invalid'), 1501);
  PERFORM t.ok('niveis','3000 → Goat por pontos (piso Crew ultrapassado)', (SELECT level_name||protected FROM club_member_level(t.m('lv1499@example.invalid'))) = 'Goatfalse');
  PERFORM t.ok('niveis','ranking usa nível canónico', (SELECT level_name FROM club_ranking('00000000-0000-4000-8000-0000000000a2', 1000) WHERE member_id = t.m('lv500@example.invalid')) = 'Crew');
  INSERT INTO club_wallet_passes(company_id, member_id, platform, object_id, last_points, last_level)
    VALUES ('00000000-0000-4000-8000-0000000000a1', t.m('lv500@example.invalid'), 'google', 'obj.fixture', 500, 'Crew');
  PERFORM t.ok('niveis','Wallet: nível protegido não gera PATCH de descida', NOT EXISTS (SELECT 1 FROM club_wallet_due(100) WHERE member_id = t.m('lv500@example.invalid')));
  UPDATE club_wallet_passes SET last_level = 'Gang' WHERE object_id = 'obj.fixture';
  PERFORM t.ok('niveis','Wallet: due devolve nível canónico', (SELECT level_name FROM club_wallet_due(100) WHERE member_id = t.m('lv500@example.invalid')) = 'Crew');
END $$;

-- 4) Inscrição 100 uma vez/edição.
DO $$ DECLARE a uuid; BEGIN
  a := t.newc('novo1@example.invalid');
  PERFORM club_confirm_member(a); PERFORM club_confirm_member(a);
  PERFORM t.ok('inscricao','nova inscrição 100 uma vez', t.rp('join_confirmed', a) = 100 AND t.cnt('join_confirmed', a) = 1);
  PERFORM t.ok('inscricao','crédito gravado com a edição', (SELECT event_id FROM club_points WHERE member_id = a AND rule_key='join_confirmed') = '00000000-0000-4000-8000-0000000000e1');
  PERFORM club_confirm_member(t.m('legacy1@example.invalid'));
  PERFORM t.ok('inscricao','legado já inscrito não recebe 2.º 100', t.cnt('join_confirmed', t.m('legacy1@example.invalid')) = 1);
END $$;

-- 5) Indicação 75, teto 750, contagem real separada.
DO $$ DECLARE r uuid; i int; x uuid; p jsonb; BEGIN
  r := t.newc('ref@example.invalid');
  FOR i IN 1..12 LOOP PERFORM t.newc('ref_f'||i||'@example.invalid', t.code(r)); END LOOP;
  PERFORM t.ok('indicacao','12 amigos → 10×75 = 750', t.rp('friend_joined', r) = 750 AND t.cnt('friend_joined', r) = 10, t.rp('friend_joined', r)::text);
  p := club_referral_progress(r);
  PERFORM t.ok('indicacao','contagem real = 12 (teto não pára contagem)', (p->>'confirmed_friends')::int = 12, p::text);
  PERFORM t.ok('indicacao','conquistas 3 e 5 sem pontos extra', (p->'badges'->>'friends_3')::boolean AND (p->'badges'->>'friends_5')::boolean
     AND NOT EXISTS (SELECT 1 FROM club_points WHERE member_id = r AND rule_key NOT IN ('join_confirmed','friend_joined')));
  PERFORM t.ok('indicacao','progresso sem identidades', NOT (p::text ~ '@|[0-9a-f]{8}-'));
  PERFORM t.ok('indicacao','registos de contagem: 10 com 75 e 2 com 0', (SELECT count(*) FILTER (WHERE credited_points=75)||'/'||count(*) FILTER (WHERE credited_points=0) FROM club_referral_events WHERE member_id = r) = '10/2');
  -- Legado: matriz 150×1 / 150×5 / 150×10.
  FOR i IN 1..10 LOOP PERFORM t.newc('l1new'||i||'@example.invalid', t.code(t.m('legacy1@example.invalid'))); END LOOP;
  PERFORM t.ok('legado','150×1 → +8×75 até 750', t.rp('friend_joined', t.m('legacy1@example.invalid')) = 750, t.rp('friend_joined', t.m('legacy1@example.invalid'))::text);
  PERFORM t.newc('l5new@example.invalid', t.code(t.m('legacy5@example.invalid')));
  PERFORM t.ok('legado','150×5 = 750 → nenhum crédito extra', t.rp('friend_joined', t.m('legacy5@example.invalid')) = 750);
  PERFORM t.newc('l10new@example.invalid', t.code(t.m('legacy10@example.invalid')));
  PERFORM t.ok('legado','150×10 = 1500 → nenhum extra e nada removido', t.rp('friend_joined', t.m('legacy10@example.invalid')) = 1500);
  -- Inscrito antes do patch (indicado por legacy1, já no teto) confirma agora: conta, mas não credita.
  PERFORM club_confirm_member(t.m('pre_pending@example.invalid'));
  PERFORM t.ok('legado','indicado pré-patch confirma no teto → 0', t.rp('friend_joined', t.m('legacy1@example.invalid')) = 750);
  -- Só confirmação nova / atribuição original.
  x := t.m('ref_f1@example.invalid');
  PERFORM t.ok('indicacao','reinscrição com outro código não muda atribuição', t.new('ref_f1@example.invalid', t.code(t.m('novo1@example.invalid'))) = x
     AND (SELECT referred_by_member_id FROM club_members WHERE id = x) = r);
  PERFORM club_confirm_member(x);
  PERFORM t.ok('indicacao','reconfirmação não credita ninguém', t.rp('friend_joined', t.m('novo1@example.invalid')) = 0 AND t.cnt('friend_joined', r) = 10);
  -- Anulação liberta espaço do teto (crédito anulado deixa de contar); nunca apaga.
  PERFORM _club_points_void_row((SELECT q FROM club_points q WHERE q.member_id = r AND q.rule_key='friend_joined' ORDER BY q.created_at, q.id LIMIT 1), 'fixture: fraude');
  PERFORM t.ok('indicacao','após anulação: 675 ativos', t.rp('friend_joined', r) + coalesce((SELECT sum(points) FROM club_points WHERE member_id=r AND rule_key='void'),0) = 675);
  PERFORM t.newc('ref_f13@example.invalid', t.code(r));
  PERFORM t.ok('indicacao','novo amigo após anulação volta a 750 ativos', t.rp('friend_joined', r) + coalesce((SELECT sum(points) FROM club_points WHERE member_id=r AND rule_key='void'),0) = 750);
  -- Outro site (sem config) mantém regra atual.
  x := t.newc('outro_ref@example.invalid', NULL, '00000000-0000-4000-8000-0000000000b2');
  PERFORM t.newc('outro_f@example.invalid', t.code(x), '00000000-0000-4000-8000-0000000000b2');
  PERFORM t.ok('outro_site','site sem config: indicação 150 (inalterado)', t.rp('friend_joined', x) = 150);
  PERFORM t.ok('outro_site','mesma pessoa noutro site é membro separado', t.m('legacy1@example.invalid','00000000-0000-4000-8000-0000000000b2') <> t.m('legacy1@example.invalid'));
END $$;

-- 6) Crew 100 uma vez/membro/edição; min 4 / max 6.
DO $$ DECLARE o uuid; c uuid; cd text; i int; m uuid; j jsonb; c2 uuid; BEGIN
  o := t.newc('cw1@example.invalid');
  j := club_crew_create(o, 'Crew Nova'); c := (j->>'id')::uuid; cd := j->>'code';
  FOR i IN 2..3 LOOP PERFORM club_crew_join(t.newc('cw'||i||'@example.invalid'), cd); END LOOP;
  PERFORM t.ok('crew','3 membros: sem crédito', t.rp('crew_complete', o) = 0);
  PERFORM club_crew_join(t.newc('cw4@example.invalid'), cd);
  PERFORM t.ok('crew','4.º completa: 100 a cada um dos 4', (SELECT count(*) FROM club_points p JOIN club_crew_members cm ON cm.member_id = p.member_id WHERE cm.crew_id = c AND p.rule_key='crew_complete' AND p.points = 100) = 4);
  PERFORM club_crew_join(t.newc('cw5@example.invalid'), cd); PERFORM club_crew_join(t.newc('cw6@example.invalid'), cd);
  PERFORM t.ok('crew','5.º e 6.º: 100 uma vez', t.rp('crew_complete', t.m('cw5@example.invalid')) = 100 AND t.rp('crew_complete', t.m('cw6@example.invalid')) = 100);
  PERFORM t.ok('crew','7.º recusado (crew_full)', club_crew_join(t.newc('cw7@example.invalid'), cd)->>'error' = 'crew_full');
  PERFORM club_crew_check(c); PERFORM club_crew_check(c);
  PERFORM t.ok('crew','verificação repetida não duplica', t.cnt('crew_complete', o) = 1);
  -- Troca de grupo: sai e entra noutra crew já completa → nada.
  j := club_crew_create(t.newc('cx1@example.invalid'), 'Crew Outra'); c2 := (j->>'id')::uuid;
  FOR i IN 2..4 LOOP PERFORM club_crew_join(t.newc('cx'||i||'@example.invalid'), j->>'code'); END LOOP;
  PERFORM club_crew_leave(t.m('cw6@example.invalid'));
  PERFORM t.ok('crew','troca de grupo: entra', (club_crew_join(t.m('cw6@example.invalid'), j->>'code')->>'crew_id') IS NOT NULL);
  PERFORM t.ok('crew','troca de grupo: sem 2.º crédito (único independente do grupo)', t.rp('crew_complete', t.m('cw6@example.invalid')) = 100 AND t.cnt('crew_complete', t.m('cw6@example.invalid')) = 1);
  PERFORM t.ok('crew','sair não retira pontos', t.rp('crew_complete', t.m('cw6@example.invalid')) = 100);
  -- Legado com crew_complete 200: já consumiu.
  PERFORM club_crew_leave(t.m('lcrew4@example.invalid'));
  PERFORM club_crew_join(t.m('lcrew4@example.invalid'), j->>'code');
  PERFORM t.ok('crew','legado com 200 já consumiu o crédito único', t.rp('crew_complete', t.m('lcrew4@example.invalid')) = 200 AND t.cnt('crew_complete', t.m('lcrew4@example.invalid')) = 1);
  -- #328 sem regressão: código pendente com crew cheia preservado na confirmação.
  m := t.new('cw_pend@example.invalid'); UPDATE club_members SET pending_crew_code = cd WHERE id = m;
  PERFORM club_confirm_member(m);
  PERFORM t.ok('328','crew cheia na confirmação: código preservado + estado', (SELECT pending_crew_code = cd AND pending_crew_status = 'crew_full' FROM club_members WHERE id = m));
  PERFORM t.ok('328','confirmação continua a dar inscrição', t.rp('join_confirmed', m) = 100);
  PERFORM t.ok('328','identidade por email (telefone não identifica)', club_upsert_member('00000000-0000-4000-8000-0000000000a2', 'outro@example.invalid', 'X', '+351900000999', NULL, NULL, 'formulario') <> m);
END $$;

-- 7) Compra própria: só com prova; fail-closed.
DO $$ DECLARE a uuid; b uuid; e1 uuid; e2 uuid; e3 uuid; e4 uuid; e5 uuid; ok boolean := false; BEGIN
  a := t.newc('buyer@example.invalid'); b := t.newc('buyer2@example.invalid');
  PERFORM t.ok('compra','club_award genérico (clique) → 0', club_award(a, 'promo_lot_purchase', 'clique') = 0);
  INSERT INTO club_purchase_evidence(company_id, site_id, event_id, member_id, source, order_ref, lot_ref, status, fingerprint)
    VALUES ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000e1', a, 'fever_order','ORD-1','EB1','valid','fp1') RETURNING id INTO e1;
  PERFORM t.ok('compra','compra desligada na config → 0 (fail-closed)', club_award_purchase(e1) = 0);
  UPDATE club_points_config SET purchase_enabled = true, purchase_lots = '{EB1}' WHERE version = 'e1-v1';
  PERFORM t.ok('compra','prova válida lote elegível → 200', club_award_purchase(e1) = 200 AND t.rp('promo_lot_purchase', a) = 200);
  PERFORM t.ok('compra','repetição → 0', club_award_purchase(e1) = 0);
  INSERT INTO club_purchase_evidence(company_id, site_id, event_id, member_id, source, order_ref, lot_ref, status, fingerprint)
    VALUES ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000e1', a, 'fever_order','ORD-2','EB1','valid','fp2') RETURNING id INTO e2;
  PERFORM t.ok('compra','2.ª compra na mesma edição → 0', club_award_purchase(e2) = 0);
  INSERT INTO club_purchase_evidence(company_id, site_id, event_id, member_id, source, order_ref, lot_ref, status, fingerprint)
    VALUES ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000e1', b, 'fever_order','ORD-3','GERAL','valid','fp3') RETURNING id INTO e3;
  PERFORM t.ok('compra','lote não elegível → 0', club_award_purchase(e3) = 0);
  INSERT INTO club_purchase_evidence(company_id, site_id, event_id, member_id, source, order_ref, lot_ref, status, fingerprint)
    VALUES ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000e2', b, 'fever_order','ORD-4','EB1','valid','fp4') RETURNING id INTO e4;
  PERFORM t.ok('compra','prova de outra edição → 0', club_award_purchase(e4) = 0);
  BEGIN
    INSERT INTO club_purchase_evidence(company_id, site_id, event_id, member_id, source, order_ref, lot_ref, status, fingerprint)
      VALUES ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000e1', b, 'fever_order','ORD-1','EB1','valid','fp1');
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  PERFORM t.ok('compra','mesma encomenda para outro membro recusada (fingerprint)', ok);
  PERFORM t.ok('compra','reembolso anula (linha void, nada apagado)', club_purchase_revoke(e1, 'refunded', 'fixture: reembolso') = 1
     AND t.rp('promo_lot_purchase', a) = 200 AND t.rp('void', a) = -200);
  PERFORM t.ok('compra','prova reembolsada não credita', club_award_purchase(e1) = 0);
  PERFORM t.ok('compra','reaprovação com prova válida → nova geração #2', club_award_purchase(e2) = 200
     AND EXISTS (SELECT 1 FROM club_points WHERE member_id = a AND rule_key='promo_lot_purchase' AND ref_id LIKE 'purchase@%#2'));
  PERFORM t.ok('compra','revogar prova não creditada → 0', club_purchase_revoke(e3, 'cancelled', 'fixture') = 0);
  UPDATE club_points_config SET purchase_enabled = false, purchase_lots = '{}' WHERE version = 'e1-v1';
END $$;

-- 8) Outras regras: valores inalterados (não aprovadas), gravadas com edição.
DO $$ DECLARE a uuid; BEGIN
  a := t.newc('outras@example.invalid');
  PERFORM t.ok('outras','palpite 50 inalterado', club_award(a, 'guess_correct', 'rev1') = 50);
  PERFORM t.ok('outras','presença 100 inalterada', club_award(a, 'attended_year', '2026') = 100);
  PERFORM t.ok('outras','friend_bought 300 inalterado (sem chamadores no código)', club_award(a, 'friend_bought', 'x') = 300);
END $$;

-- 9) Nova edição (e2): config nova, créditos antigos mantêm a edição gravada; teto reinicia; legado não conta.
INSERT INTO club_points_config(company_id, site_id, version, event_id, status, legacy_counts, join_points, referral_points, referral_cap,
  crew_points, purchase_points, purchase_enabled, purchase_lots, levels)
VALUES ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2','e2-v1','00000000-0000-4000-8000-0000000000e2','draft',false,
  100,75,750,100,200,false,'{}','{"Gang":0,"Crew":750,"Goat":3000}');
DO $$ DECLARE r uuid; before_e1 text; BEGIN
  before_e1 := (SELECT count(*)||'/'||sum(points) FROM club_points WHERE event_id = '00000000-0000-4000-8000-0000000000e1');
  UPDATE portal_sites SET event_id = '00000000-0000-4000-8000-0000000000e2' WHERE id = '00000000-0000-4000-8000-0000000000a2';
  PERFORM club_points_cutover((SELECT id FROM club_points_config WHERE version='e2-v1'), '{"Gang":0,"Crew":750,"Goat":3000}');
  PERFORM t.ok('edicao','créditos da edição 1 preservados após troca do site', (SELECT count(*)||'/'||sum(points) FROM club_points WHERE event_id = '00000000-0000-4000-8000-0000000000e1') = before_e1);
  PERFORM t.ok('edicao','config e1 retirada, e2 ativa', (SELECT string_agg(version||':'||status, ',' ORDER BY version) FROM club_points_config WHERE site_id='00000000-0000-4000-8000-0000000000a2') = 'e1-v1:retired,e2-v1:active');
  r := t.m('ref@example.invalid');
  PERFORM t.newc('e2f1@example.invalid', t.code(r));
  PERFORM t.ok('edicao','teto reinicia na edição 2 (+75)', (SELECT sum(points) FROM club_points WHERE member_id = r AND rule_key='friend_joined' AND event_id='00000000-0000-4000-8000-0000000000e2') = 75);
  PERFORM t.newc('e2f2@example.invalid', t.code(t.m('legacy10@example.invalid')));
  PERFORM t.ok('edicao','legado NULL não conta na edição 2', (SELECT sum(points) FROM club_points WHERE member_id = t.m('legacy10@example.invalid') AND event_id='00000000-0000-4000-8000-0000000000e2') = 75);
  PERFORM t.ok('edicao','pisos mantidos', (SELECT level_name FROM club_member_level(t.m('lv500@example.invalid'))) = 'Crew');
END $$;
SELECT 'SERIAL327 ' || count(*) FILTER (WHERE ok) || '/' || count(*) FROM t.results;
