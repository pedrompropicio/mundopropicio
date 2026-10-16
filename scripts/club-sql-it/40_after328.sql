-- #328 — DEPOIS: funções do supabase/manual/20261016_issue328.PENDENTE.sql carregadas localmente.
\set ON_ERROR_STOP 1

-- 0. Patch não alterou dados existentes.
DO $$ BEGIN
  PERFORM it.ok('depois','patch preserva soma de pontos', (SELECT coalesce(sum(points),0)::text FROM club_points) = (SELECT v FROM it.kv WHERE k='points_sum'));
  PERFORM it.ok('depois','patch preserva nº de créditos', (SELECT count(*)::text FROM club_points) = (SELECT v FROM it.kv WHERE k='points_n'));
  PERFORM it.ok('depois','patch preserva membros/ids/emails/telefones/ref/pendentes',
    (SELECT md5(string_agg(id::text||coalesce(email,'')||coalesce(phone,'')||coalesce(referred_by_member_id::text,'')||coalesce(pending_crew_code,''), ',' ORDER BY id)) FROM club_members) = (SELECT v FROM it.kv WHERE k='members_hash'));
  PERFORM it.ok('depois','colunas novas vazias nos existentes', NOT EXISTS (SELECT 1 FROM club_members WHERE pending_crew_status IS NOT NULL OR pending_crew_checked_at IS NOT NULL));
END $$;

-- 1/2. Identidade por email; telefone não identifica.
DO $$ DECLARE a uuid; b uuid; c uuid; x uuid; n0 int; BEGIN
  a := it.new('dep.tel1@example.invalid', NULL, '+351900000201');
  b := it.new('dep.tel2@example.invalid', NULL, '+351900000201');
  PERFORM it.ok('identidade','emails distintos + mesmo telefone => membros distintos', a <> b AND b IS NOT NULL);
  PERFORM it.ok('identidade','telefone guardado em ambos', (SELECT count(*) FROM club_members WHERE phone='+351900000201') = 2);
  PERFORM it.ok('identidade','member_no distintos', (SELECT count(DISTINCT member_no) FROM club_members WHERE id IN (a,b)) = 2);
  c := it.new('  DEP.Tel1@Example.INVALID ', NULL, '+351900000999');
  PERFORM it.ok('identidade','normalização (maiúsc./espaços) => mesmo membro', c = a);
  PERFORM it.ok('identidade','telefone existente não é sobrescrito', (SELECT phone FROM club_members WHERE id=a) = '+351900000201');
  -- Retry/referral
  x := it.newc('dep.conv1@example.invalid');
  c := it.new('dep.ref@example.invalid', it.code(x), NULL, 'Primeiro');
  n0 := (SELECT count(*) FROM club_members);
  PERFORM it.ok('identidade','retry com outro código devolve o mesmo', it.new('dep.ref@example.invalid', it.code(a), NULL, 'Outro') = c);
  PERFORM it.ok('identidade','retry não cria membro', (SELECT count(*) FROM club_members) = n0);
  PERFORM it.ok('identidade','referral original preservado', (SELECT referred_by_member_id FROM club_members WHERE id=c) = x);
  PERFORM it.ok('identidade','nome original preservado', (SELECT first_name FROM club_members WHERE id=c) = 'Primeiro');
  PERFORM club_confirm_member(c); PERFORM club_confirm_member(c);
  PERFORM it.ok('identidade','crédito único join/friend', it.n('join_confirmed',c) = 1 AND it.n('friend_joined',x) = 1);
  PERFORM it.ok('identidade','email vazio => NULL', it.new('  ') IS NULL);
  -- Sessões não cruzadas (token por member_id; emails distintos com mesmo telefone).
  INSERT INTO club_member_sessions(member_id, site_id, token_hash) VALUES (a, '00000000-0000-4000-8000-0000000000a2', 'it-hash-a'), (b, '00000000-0000-4000-8000-0000000000a2', 'it-hash-b');
  PERFORM it.ok('identidade','sessão A resolve só para A', (SELECT member_id FROM club_member_sessions WHERE token_hash='it-hash-a') = a);
  PERFORM it.ok('identidade','sessão B resolve só para B', (SELECT member_id FROM club_member_sessions WHERE token_hash='it-hash-b') = b);
END $$;

-- 3. Crew cheia / inválida na confirmação.
DO $$ DECLARE r jsonb; h uuid; t timestamptz; j jsonb; cnt int; o uuid; BEGIN
  r := it.full_crew('dep.cf');
  h := it.new('dep.pend@example.invalid');
  UPDATE club_members SET pending_crew_code = r->>'code' WHERE id = h;
  PERFORM club_confirm_member(h);
  PERFORM it.ok('crew_cheia','confirmação válida +100', it.pts(h) = 100 AND (SELECT confirmed_at IS NOT NULL FROM club_members WHERE id=h));
  PERFORM it.ok('crew_cheia','código preservado + estado crew_full',
    (SELECT pending_crew_code = r->>'code' AND pending_crew_status = 'crew_full' AND pending_crew_checked_at IS NOT NULL FROM club_members WHERE id=h));
  PERFORM it.ok('crew_cheia','crew continua com 6', (SELECT count(*) FROM club_crew_members WHERE crew_id = (r->>'id')::uuid) = 6);
  t := (SELECT pending_crew_checked_at FROM club_members WHERE id=h);
  PERFORM club_confirm_member(h); PERFORM club_confirm_member(h);
  PERFORM it.ok('crew_cheia','confirmação repetida não volta a tentar (sem loop)', (SELECT pending_crew_checked_at FROM club_members WHERE id=h) = t);
  PERFORM it.ok('crew_cheia','confirmação repetida sem crédito duplicado', it.n('join_confirmed',h) = 1);
  j := club_crew_pending(h, 'status');
  PERFORM it.ok('crew_cheia','status devolve crew_full + nome, sem email/token',
    j->'pending'->>'status' = 'crew_full' AND j->'pending'->>'crew_name' = 'Crew dep.cf' AND j::text !~ '@' AND NOT (j->'pending' ? 'token'), j::text);
  j := club_crew_pending(h, 'retry');
  PERFORM it.ok('crew_cheia','retry com crew cheia => crew_full, sem entrada', j->'pending'->>'status' = 'crew_full' AND NOT EXISTS (SELECT 1 FROM club_crew_members WHERE member_id=h));
  -- Liberta uma vaga e tenta outra vez (ação explícita).
  PERFORM club_crew_leave(it.m('dep.cf5@example.invalid'));
  j := club_crew_pending(h, 'retry');
  PERFORM it.ok('crew_cheia','retry com vaga => entra e limpa pendência', j->'pending' = 'null'::jsonb
    AND EXISTS (SELECT 1 FROM club_crew_members WHERE member_id=h AND crew_id=(r->>'id')::uuid)
    AND (SELECT pending_crew_code IS NULL AND pending_crew_status IS NULL FROM club_members WHERE id=h), j::text);
  PERFORM it.ok('crew_cheia','crew_complete único para quem entra', it.n('crew_complete',h) = 1);
  j := club_crew_pending(h, 'retry');
  PERFORM it.ok('crew_cheia','retry sem pendência => null, sem duplicar', j->'pending' = 'null'::jsonb AND it.n('crew_complete',h) = 1);
  -- Código inexistente + dismiss.
  h := it.new('dep.inv@example.invalid');
  UPDATE club_members SET pending_crew_code = 'ZZZZZZ' WHERE id = h;
  PERFORM club_confirm_member(h);
  PERFORM it.ok('crew_invalida','estado crew_not_found, confirmado +100',
    (SELECT pending_crew_status FROM club_members WHERE id=h) = 'crew_not_found' AND it.pts(h) = 100);
  j := club_crew_pending(h, 'dismiss');
  PERFORM it.ok('crew_invalida','dismiss limpa', j->'pending' = 'null'::jsonb AND (SELECT pending_crew_code IS NULL FROM club_members WHERE id=h));
  -- Membro que entrou noutra crew: pendência auto-limpa.
  h := it.new('dep.auto@example.invalid');
  UPDATE club_members SET pending_crew_code = r->>'code' WHERE id = h;
  PERFORM club_confirm_member(h);
  PERFORM it.ok('crew_cheia','2.º candidato fica crew_full', (SELECT pending_crew_status FROM club_members WHERE id=h) = 'crew_full');
  PERFORM club_crew_create(h, 'Outra Gang');
  j := club_crew_pending(h, 'status');
  PERFORM it.ok('crew_cheia','já em crew => pendência limpa', j->'pending' = 'null'::jsonb AND (SELECT pending_crew_code IS NULL FROM club_members WHERE id=h));
  -- Não confirmado / ação inválida.
  h := it.new('dep.nc@example.invalid');
  PERFORM it.ok('crew_pending','não confirmado => no_session', club_crew_pending(h,'status')->>'error' = 'no_session');
  PERFORM it.ok('crew_pending','ação inválida', club_crew_pending(it.m('dep.inv@example.invalid'),'x')->>'error' = 'action');
  -- Caminho feliz mantém-se (pendente válido entra e é limpo).
  o := it.newc('dep.ok0@example.invalid'); r := club_crew_create(o, 'Feliz Gang');
  h := it.new('dep.ok1@example.invalid'); UPDATE club_members SET pending_crew_code = r->>'code' WHERE id = h;
  PERFORM club_confirm_member(h);
  PERFORM it.ok('regressao','pendente válido entra e limpa', EXISTS (SELECT 1 FROM club_crew_members WHERE member_id=h) AND (SELECT pending_crew_code IS NULL AND pending_crew_status IS NULL FROM club_members WHERE id=h));
  -- min 4: com 2 confirmados não completa; ao 4.º completa (200 a cada).
  PERFORM club_crew_join(it.newc('dep.ok2@example.invalid'), r->>'code');
  PERFORM it.ok('regressao','3 membros => incompleta', (SELECT completed_at IS NULL FROM club_crews WHERE id=(r->>'id')::uuid));
  PERFORM club_crew_join(it.newc('dep.ok3@example.invalid'), r->>'code');
  PERFORM it.ok('regressao','4.º => completa, 200 a cada', (SELECT completed_at IS NOT NULL FROM club_crews WHERE id=(r->>'id')::uuid) AND it.n('crew_complete', o) = 1 AND it.pts(o) = 300);
  -- Pontos antigos nunca removidos.
  PERFORM it.ok('regressao','nenhum crédito anterior removido', (SELECT count(*) FROM club_points)::int >= (SELECT v::int FROM it.kv WHERE k='points_n'));
END $$;
