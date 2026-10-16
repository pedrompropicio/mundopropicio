-- #328 — ANTES: reproduz os defeitos com as funções canónicas (hash = Live). Dados sintéticos.
\set ON_ERROR_STOP 1
CREATE SCHEMA it;
CREATE TABLE it.results (n serial, phase text, name text, ok boolean, detail text);
CREATE TABLE it.kv (k text PRIMARY KEY, v text);
CREATE FUNCTION it.ok(p_phase text, p_name text, p_cond boolean, p_detail text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO it.results(phase, name, ok, detail) VALUES (p_phase, p_name, coalesce(p_cond,false), p_detail);
  IF NOT coalesce(p_cond,false) THEN RAISE EXCEPTION 'ASSERT FALHOU [%] % — %', p_phase, p_name, p_detail; END IF;
END $$;
CREATE FUNCTION it.pts(p uuid) RETURNS int LANGUAGE sql AS $$ SELECT coalesce(sum(points),0)::int FROM public.club_points WHERE member_id = p $$;
CREATE FUNCTION it.n(p_rule text, p uuid) RETURNS int LANGUAGE sql AS $$ SELECT count(*)::int FROM public.club_points WHERE member_id = p AND rule_key = p_rule $$;
CREATE FUNCTION it.m(p_email text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.club_members WHERE lower(email) = lower(p_email) $$;
CREATE FUNCTION it.code(p uuid) RETURNS text LANGUAGE sql AS $$ SELECT referral_code FROM public.club_members WHERE id = p $$;
CREATE FUNCTION it.new(p_email text, p_ref text DEFAULT NULL, p_phone text DEFAULT NULL, p_name text DEFAULT 'Teste') RETURNS uuid LANGUAGE sql AS $$
  SELECT public.club_upsert_member('00000000-0000-4000-8000-0000000000a2', p_email, p_name, p_phone, NULL, p_ref, 'formulario') $$;
CREATE FUNCTION it.newc(p_email text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE m uuid := it.new(p_email); BEGIN PERFORM public.club_confirm_member(m); RETURN m; END $$;
-- Crew cheia (6) com dono o.
CREATE FUNCTION it.full_crew(p_prefix text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE o uuid; r jsonb; BEGIN
  o := it.newc(p_prefix||'0@example.invalid'); r := public.club_crew_create(o, 'Crew '||p_prefix);
  FOR i IN 1..5 LOOP PERFORM public.club_crew_join(it.newc(p_prefix||i||'@example.invalid'), r->>'code'); END LOOP;
  RETURN r; END $$;

INSERT INTO public.companies(id, name) VALUES ('00000000-0000-4000-8000-0000000000a1', 'Empresa fictícia #328');
INSERT INTO public.events(id, company_id, name) VALUES ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a1', 'Evento fictício');
INSERT INTO public.portal_sites(id, company_id, domain, event_id, brand_key, active)
VALUES ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1', 'ng.example.invalid', '00000000-0000-4000-8000-0000000000a3', 'newgang', true);
INSERT INTO public.club_point_rules(company_id, site_id, rule_key, label, points, min_members, max_members) VALUES
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2','join_confirmed','Confirmar',100,NULL,NULL),
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2','friend_joined','Amigo confirmou',150,NULL,NULL),
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2','crew_complete','Crew completa',200,4,6);

-- Defeito 2: email novo + telefone existente devolve membro antigo.
DO $$ DECLARE a uuid; b uuid; BEGIN
  a := it.new('antes.tel1@example.invalid', NULL, '+351900000101');
  b := it.new('antes.tel2@example.invalid', NULL, '+351900000101');
  PERFORM it.ok('antes','DEFEITO 2 reproduzido: email novo com mesmo telefone => membro antigo', a = b);
  PERFORM it.ok('antes','DEFEITO 2: email novo não ficou registado', it.m('antes.tel2@example.invalid') IS NULL);
END $$;

-- Defeito 3: Crew cheia na confirmação apaga pending_crew_code sem rasto.
DO $$ DECLARE r jsonb; h uuid; BEGIN
  r := it.full_crew('antes.cf');
  h := it.new('antes.pend@example.invalid');
  UPDATE club_members SET pending_crew_code = r->>'code' WHERE id = h;
  PERFORM club_confirm_member(h);
  PERFORM it.ok('antes','DEFEITO 3 reproduzido: confirmado +100', it.pts(h) = 100);
  PERFORM it.ok('antes','DEFEITO 3 reproduzido: pending_crew_code apagado e fora da crew',
    (SELECT pending_crew_code FROM club_members WHERE id=h) IS NULL AND NOT EXISTS (SELECT 1 FROM club_crew_members WHERE member_id=h));
END $$;

-- Dados existentes a preservar pelo patch (pontos + pendente ainda por confirmar).
DO $$ DECLARE p uuid; BEGIN
  p := it.new('antes.preserva@example.invalid');
  UPDATE club_members SET pending_crew_code = 'ABCDEF' WHERE id = p;
END $$;

-- Defeito 4 (revisão 2): membro JÁ confirmado reenvia formulário com Crew cheia → código perdido sem rasto.
CREATE FUNCTION it.lc(p_email text, p_raw jsonb) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i uuid; BEGIN
  INSERT INTO public.lead_capture(company_id, source, email, name, raw)
  VALUES ('00000000-0000-4000-8000-0000000000a1', 'clube_newgang', p_email, 'Teste IT', p_raw) RETURNING id INTO i;
  UPDATE public.lead_capture SET processed = true WHERE id = i;  -- dispara trg_club_from_lead_capture (AFTER UPDATE OF processed)
  RETURN i; END $$;
DO $$ DECLARE r jsonb; h uuid; l uuid; BEGIN
  r := it.full_crew('antes.tg');
  h := it.newc('antes.tg.reenvio@example.invalid');
  l := it.lc('antes.tg.reenvio@example.invalid', jsonb_build_object('crew_code', r->>'code'));
  PERFORM it.ok('antes','DEFEITO 4 reproduzido: confirmado + crew cheia via formulário => sem crew e sem código guardado',
    NOT EXISTS (SELECT 1 FROM club_crew_members WHERE member_id=h) AND (SELECT pending_crew_code IS NULL FROM club_members WHERE id=h));
  PERFORM it.ok('antes','trigger não abortou: lead continua processed', (SELECT processed FROM lead_capture WHERE id=l));
END $$;
