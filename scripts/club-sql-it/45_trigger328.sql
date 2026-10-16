-- #328 revisão 2 — trigger REAL club_from_lead_capture (corpo do pendente) via UPDATE processed em lead_capture.
-- Transportes: schema net inexistente → notify cai no EXCEPTION (WARNING), sem rede. Sem emails.
\set ON_ERROR_STOP 1
DO $$ DECLARE r jsonb; f jsonb; f2 jsonb; a jsonb; b jsonb; o uuid; h uuid; z uuid; w uuid; l uuid; t timestamptz; j jsonb; p0 int; BEGIN
  -- feliz
  o := it.newc('tg.dono@example.invalid'); r := club_crew_create(o, 'Trigger Feliz');
  h := it.newc('tg.feliz@example.invalid');
  l := it.lc('tg.feliz@example.invalid', jsonb_build_object('crew_code', lower(' '||(r->>'code')||' ')));
  PERFORM it.ok('trigger','feliz: confirmado entra pela captura (código normalizado)', EXISTS (SELECT 1 FROM club_crew_members WHERE member_id=h AND crew_id=(r->>'id')::uuid)
    AND (SELECT pending_crew_code IS NULL AND pending_crew_status IS NULL FROM club_members WHERE id=h));
  PERFORM it.ok('trigger','processed preservado', (SELECT processed FROM lead_capture WHERE id=l));
  -- cheia
  f := it.full_crew('tg.f1'); f2 := it.full_crew('tg.f2');
  h := it.newc('tg.cheia@example.invalid'); p0 := it.pts(h);
  l := it.lc('tg.cheia@example.invalid', jsonb_build_object('crew_code', f->>'code'));
  PERFORM it.ok('trigger','cheia: código+crew_full+checked_at guardados', (SELECT pending_crew_code=f->>'code' AND pending_crew_status='crew_full' AND pending_crew_checked_at IS NOT NULL FROM club_members WHERE id=h));
  PERFORM it.ok('trigger','cheia: crew mantém 6', (SELECT count(*) FROM club_crew_members WHERE crew_id=(f->>'id')::uuid)=6);
  t := (SELECT pending_crew_checked_at FROM club_members WHERE id=h);
  PERFORM club_confirm_member(h); PERFORM club_confirm_member(h);
  PERFORM it.ok('trigger','confirmação repetida sem loop nem crédito', (SELECT pending_crew_checked_at FROM club_members WHERE id=h)=t AND it.pts(h)=p0 AND it.n('join_confirmed',h)=1);
  -- novo código também cheio substitui o par
  PERFORM pg_sleep(0.01);
  l := it.lc('tg.cheia@example.invalid', jsonb_build_object('crew_code', f2->>'code'));
  PERFORM it.ok('trigger','novo convite cheio substitui código e renova checked_at', (SELECT pending_crew_code=f2->>'code' AND pending_crew_status='crew_full' AND pending_crew_checked_at>t FROM club_members WHERE id=h));
  -- inexistente com formato válido
  l := it.lc('tg.cheia@example.invalid', '{"crew_code":"ZZZZZZ"}');
  PERFORM it.ok('trigger','código inexistente => crew_not_found (substitui crew_full)', (SELECT pending_crew_code='ZZZZZZ' AND pending_crew_status='crew_not_found' FROM club_members WHERE id=h));
  -- formato inválido
  l := it.lc('tg.cheia@example.invalid', '{"crew_code":" ab-c!1 "}');
  PERFORM it.ok('trigger','formato inválido => normalizado A-Z0-9 + crew_not_found', (SELECT pending_crew_code='ABC1' AND pending_crew_status='crew_not_found' FROM club_members WHERE id=h));
  -- novo código com vaga após falha: entra, sem herdar erro
  l := it.lc('tg.cheia@example.invalid', jsonb_build_object('crew_code', r->>'code'));
  PERFORM it.ok('trigger','novo código após falha => entra e limpa par', EXISTS (SELECT 1 FROM club_crew_members WHERE member_id=h AND crew_id=(r->>'id')::uuid)
    AND (SELECT pending_crew_code IS NULL AND pending_crew_status IS NULL AND pending_crew_checked_at IS NULL FROM club_members WHERE id=h));
  PERFORM it.ok('trigger','reenvio do código da própria crew => sem pendência', (SELECT it.lc('tg.cheia@example.invalid', jsonb_build_object('crew_code', r->>'code')) IS NOT NULL)
    AND (SELECT pending_crew_code IS NULL FROM club_members WHERE id=h));
  -- já noutra Crew
  z := it.newc('tg.outra@example.invalid'); a := club_crew_create(z, 'Trigger A');
  o := it.newc('tg.donob@example.invalid'); b := club_crew_create(o, 'Trigger B');
  l := it.lc('tg.outra@example.invalid', jsonb_build_object('crew_code', b->>'code'));
  PERFORM it.ok('trigger','já noutra crew => already_in_crew, código B guardado, continua em A',
    (SELECT pending_crew_code=b->>'code' AND pending_crew_status='already_in_crew' FROM club_members WHERE id=z) AND EXISTS (SELECT 1 FROM club_crew_members WHERE member_id=z AND crew_id=(a->>'id')::uuid));
  j := club_crew_pending(z,'status');
  PERFORM it.ok('trigger','status não apaga already_in_crew', j->'pending'->>'status'='already_in_crew' AND j->'pending'->>'crew_name'='Trigger B' AND j::text !~ '@', j::text);
  j := club_crew_pending(z,'retry');
  PERFORM it.ok('trigger','retry ainda noutra crew => already_in_crew, sem entrada', j->'pending'->>'status'='already_in_crew' AND NOT EXISTS (SELECT 1 FROM club_crew_members WHERE member_id=z AND crew_id=(b->>'id')::uuid));
  j := club_crew_pending(z,'dismiss');
  PERFORM it.ok('trigger','dismiss limpa', j->'pending'='null'::jsonb AND (SELECT pending_crew_code IS NULL FROM club_members WHERE id=z));
  -- não confirmado com erro antigo: novo convite limpa estado
  w := it.new('tg.nc@example.invalid');
  UPDATE club_members SET pending_crew_code='OLDOLD', pending_crew_status='crew_full', pending_crew_checked_at=now() WHERE id=w;
  l := it.lc('tg.nc@example.invalid', jsonb_build_object('crew_code', b->>'code'));
  PERFORM it.ok('trigger','não confirmado: novo código substitui e não herda erro', (SELECT pending_crew_code=b->>'code' AND pending_crew_status IS NULL AND pending_crew_checked_at IS NULL FROM club_members WHERE id=w));
  PERFORM club_confirm_member(w);
  PERFORM it.ok('trigger','confirmação aplica o novo código uma vez', EXISTS (SELECT 1 FROM club_crew_members WHERE member_id=w AND crew_id=(b->>'id')::uuid) AND it.n('join_confirmed',w)=1);
  -- captura sem crew_code não mexe em pendências
  UPDATE club_members SET pending_crew_code='KEEPKP', pending_crew_status='crew_full', pending_crew_checked_at=now() WHERE id=it.m('tg.feliz@example.invalid');
  DELETE FROM club_crew_members WHERE member_id=it.m('tg.feliz@example.invalid');
  l := it.lc('tg.feliz@example.invalid', '{}');
  PERFORM it.ok('trigger','captura sem crew_code preserva pendência', (SELECT pending_crew_code='KEEPKP' AND pending_crew_status='crew_full' FROM club_members WHERE id=it.m('tg.feliz@example.invalid')));
  PERFORM it.ok('trigger','todas as capturas continuam processed', NOT EXISTS (SELECT 1 FROM lead_capture WHERE email LIKE 'tg.%' AND NOT processed));
  -- crew_pending: NULL recusado
  PERFORM it.ok('crew_pending','p_action NULL => action', club_crew_pending(h, NULL)->>'error'='action' AND club_crew_pending(NULL, NULL)->>'error'='action');
  PERFORM it.ok('crew_pending','NULL não altera estado', (SELECT pending_crew_code='KEEPKP' FROM club_members WHERE id=it.m('tg.feliz@example.invalid')) AND club_crew_pending(it.m('tg.feliz@example.invalid'), NULL)->>'error'='action');
END $$;

-- retry com exceção interna: resultado recuperável, sem perda nem duplicação.
CREATE FUNCTION it.boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF current_setting('it.boom', true) = '1' THEN RAISE EXCEPTION 'it boom'; END IF; RETURN NEW; END $$;
CREATE TRIGGER it_boom BEFORE INSERT ON public.club_crew_members FOR EACH ROW EXECUTE FUNCTION it.boom();
DO $$ DECLARE o uuid; r jsonb; h uuid; j jsonb; BEGIN
  o := it.newc('bx.dono@example.invalid'); r := club_crew_create(o, 'Boom Gang');
  h := it.newc('bx.m@example.invalid');
  UPDATE club_members SET pending_crew_code=r->>'code', pending_crew_status='crew_full', pending_crew_checked_at=now() WHERE id=h;
  PERFORM set_config('it.boom','1',true);
  j := club_crew_pending(h,'retry');
  PERFORM it.ok('crew_pending','retry com exceção => status error, código preservado', j->'pending'->>'status'='error' AND j->'pending'->>'code'=r->>'code', j::text);
  PERFORM it.ok('crew_pending','exceção não deixa entrada parcial', NOT EXISTS (SELECT 1 FROM club_crew_members WHERE member_id=h));
  PERFORM set_config('it.boom','0',true);
  j := club_crew_pending(h,'retry');
  PERFORM it.ok('crew_pending','retry seguinte entra e limpa', j->'pending'='null'::jsonb AND EXISTS (SELECT 1 FROM club_crew_members WHERE member_id=h));
  PERFORM it.ok('crew_pending','sem crédito duplicado', it.n('join_confirmed',h)=1);
END $$;
DROP TRIGGER it_boom ON public.club_crew_members;
