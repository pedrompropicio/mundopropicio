-- D-ERP274: Crews do Clube Newgang.
ALTER TABLE public.club_point_rules ADD COLUMN IF NOT EXISTS min_members int, ADD COLUMN IF NOT EXISTS max_members int;
COMMENT ON COLUMN public.club_point_rules.min_members IS 'Só crew_complete: mínimo de membros confirmados para a crew ficar completa.';
COMMENT ON COLUMN public.club_point_rules.max_members IS 'Só crew_complete: máximo de membros por crew.';
ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS pending_crew_code text;
COMMENT ON COLUMN public.club_members.pending_crew_code IS 'Código de crew recebido na inscrição; aplicado ao confirmar.';

CREATE OR REPLACE FUNCTION public.club_crew_name_ok(p text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT length(trim(coalesce(p,''))) BETWEEN 2 AND 30
     AND translate(lower(coalesce(p,'')), 'áàâãéêíóôõúçü013457@$', 'aaaaeeiooouucuoleastas') !~
         '(caralh|puta|foda|fode|merda|cona|pica|porra|cabra[o]|paneleir|fdp|pqp|viado|buceta|piroca|rabeta|nazi|hitler)'
$$;

CREATE TABLE public.club_crews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id uuid NOT NULL REFERENCES public.portal_sites(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (public.club_crew_name_ok(name)),
  code text NOT NULL UNIQUE CHECK (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6,7}$'),
  owner_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE TABLE public.club_crew_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id uuid NOT NULL REFERENCES public.portal_sites(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.club_crews(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, member_id)
);
CREATE INDEX club_crew_members_crew_idx ON public.club_crew_members(crew_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_crews, public.club_crew_members TO authenticated;
GRANT ALL ON public.club_crews, public.club_crew_members TO service_role;
ALTER TABLE public.club_crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_crew_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY club_crews_select ON public.club_crews FOR SELECT TO authenticated USING (true);
CREATE POLICY club_crews_write_admin ON public.club_crews FOR ALL TO authenticated USING (public.portal_can_write()) WITH CHECK (public.portal_can_write());
CREATE POLICY company_isolation_club_crews ON public.club_crews AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));
CREATE POLICY club_crew_members_select ON public.club_crew_members FOR SELECT TO authenticated USING (true);
CREATE POLICY club_crew_members_write_admin ON public.club_crew_members FOR ALL TO authenticated USING (public.portal_can_write()) WITH CHECK (public.portal_can_write());
CREATE POLICY company_isolation_club_crew_members ON public.club_crew_members AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));

-- Configuração (regra crew_complete; omissão 200 / 4 / 6; regra inativa = 0 pontos).
CREATE OR REPLACE FUNCTION public.club_crew_cfg(p_site uuid, OUT pts int, OUT min_m int, OUT max_m int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; BEGIN
  SELECT * INTO r FROM club_point_rules WHERE site_id = p_site AND rule_key = 'crew_complete';
  IF NOT FOUND THEN pts := 200; min_m := 4; max_m := 6; RETURN; END IF;
  pts := CASE WHEN r.active THEN r.points ELSE 0 END;
  min_m := coalesce(r.min_members, 4); max_m := greatest(coalesce(r.max_members, 6), coalesce(r.min_members, 4));
END $$;

CREATE OR REPLACE FUNCTION public.club_crew_gen_code() RETURNS text LANGUAGE plpgsql SET search_path=public AS $$
DECLARE a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; BEGIN
  LOOP
    c := ''; FOR i IN 1..6 LOOP c := c || substr(a, 1 + floor(random() * length(a))::int, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM club_crews WHERE code = c);
  END LOOP;
  RETURN c;
END $$;

-- Completa ao atingir o mínimo de confirmados; depois disso cada confirmado recebe crew_complete uma vez (ref = crew).
CREATE OR REPLACE FUNCTION public.club_crew_check(p_crew uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; cfg record; n int; r record; BEGIN
  SELECT * INTO c FROM club_crews WHERE id = p_crew; IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO cfg FROM club_crew_cfg(c.site_id);
  SELECT count(*) INTO n FROM club_crew_members cm JOIN club_members m ON m.id = cm.member_id
   WHERE cm.crew_id = p_crew AND m.confirmed_at IS NOT NULL;
  IF c.completed_at IS NULL AND n >= cfg.min_m THEN
    UPDATE club_crews SET completed_at = now() WHERE id = p_crew; c.completed_at := now();
  END IF;
  IF c.completed_at IS NOT NULL THEN
    FOR r IN SELECT cm.member_id FROM club_crew_members cm JOIN club_members m ON m.id = cm.member_id
              WHERE cm.crew_id = p_crew AND m.confirmed_at IS NOT NULL LOOP
      PERFORM club_award_fixed(r.member_id, 'crew_complete', p_crew::text, cfg.pts);
    END LOOP;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.club_crew_join(p_member uuid, p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; c record; cfg record; n int; BEGIN
  SELECT * INTO m FROM club_members WHERE id = p_member;
  IF NOT FOUND OR m.confirmed_at IS NULL THEN RETURN jsonb_build_object('error','no_session'); END IF;
  SELECT * INTO c FROM club_crews WHERE code = upper(trim(coalesce(p_code,''))) AND site_id = m.site_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','crew_not_found'); END IF;
  IF EXISTS (SELECT 1 FROM club_crew_members WHERE site_id = m.site_id AND member_id = p_member) THEN
    RETURN jsonb_build_object('error','already_in_crew'); END IF;
  SELECT * INTO cfg FROM club_crew_cfg(c.site_id);
  SELECT count(*) INTO n FROM club_crew_members WHERE crew_id = c.id;
  IF n >= cfg.max_m THEN RETURN jsonb_build_object('error','crew_full'); END IF;
  INSERT INTO club_crew_members(company_id, site_id, crew_id, member_id) VALUES (c.company_id, c.site_id, c.id, p_member);
  PERFORM club_crew_check(c.id);
  RETURN jsonb_build_object('crew_id', c.id);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('error','already_in_crew');
END $$;

CREATE OR REPLACE FUNCTION public.club_crew_create(p_member uuid, p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; cid uuid; cd text; nm text := regexp_replace(trim(coalesce(p_name,'')), '\s+', ' ', 'g'); BEGIN
  SELECT * INTO m FROM club_members WHERE id = p_member;
  IF NOT FOUND OR m.confirmed_at IS NULL THEN RETURN jsonb_build_object('error','no_session'); END IF;
  IF NOT club_crew_name_ok(nm) THEN RETURN jsonb_build_object('error','crew_name'); END IF;
  IF EXISTS (SELECT 1 FROM club_crew_members WHERE site_id = m.site_id AND member_id = p_member) THEN
    RETURN jsonb_build_object('error','already_in_crew'); END IF;
  cd := club_crew_gen_code();
  INSERT INTO club_crews(company_id, site_id, name, code, owner_member_id) VALUES (m.company_id, m.site_id, nm, cd, p_member) RETURNING id INTO cid;
  INSERT INTO club_crew_members(company_id, site_id, crew_id, member_id) VALUES (m.company_id, m.site_id, cid, p_member);
  PERFORM club_crew_check(cid);
  RETURN jsonb_build_object('id', cid, 'name', nm, 'code', cd);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('error','already_in_crew');
END $$;

-- Sair: nunca retira pontos. Dono com outros membros tem de indicar o novo dono.
CREATE OR REPLACE FUNCTION public.club_crew_leave(p_member uuid, p_new_owner uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cm record; c record; others int; BEGIN
  SELECT * INTO cm FROM club_crew_members WHERE member_id = p_member LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_in_crew'); END IF;
  SELECT * INTO c FROM club_crews WHERE id = cm.crew_id FOR UPDATE;
  SELECT count(*) INTO others FROM club_crew_members WHERE crew_id = c.id AND member_id <> p_member;
  IF c.owner_member_id = p_member AND others > 0 THEN
    IF p_new_owner IS NULL OR NOT EXISTS (SELECT 1 FROM club_crew_members WHERE crew_id = c.id AND member_id = p_new_owner AND member_id <> p_member) THEN
      RETURN jsonb_build_object('error','owner_transfer'); END IF;
    UPDATE club_crews SET owner_member_id = p_new_owner WHERE id = c.id;
  END IF;
  DELETE FROM club_crew_members WHERE id = cm.id;
  IF others = 0 THEN DELETE FROM club_crews WHERE id = c.id; END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['club_crew_cfg(uuid)','club_crew_gen_code()','club_crew_check(uuid)','club_crew_join(uuid,text)','club_crew_create(uuid,text)','club_crew_leave(uuid,uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

-- Confirmação: aplica o código de crew guardado na inscrição (erro nunca bloqueia).
CREATE OR REPLACE FUNCTION public.club_confirm_member(p_member uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; j jsonb; BEGIN
  UPDATE club_members SET confirmed_at = coalesce(confirmed_at, now()), updated_at = now() WHERE id = p_member RETURNING * INTO m;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM club_award(p_member, 'join_confirmed', p_member::text);
  IF m.referred_by_member_id IS NOT NULL AND m.referred_by_member_id <> p_member THEN
    PERFORM club_award(m.referred_by_member_id, 'friend_joined', p_member::text);
  END IF;
  IF m.pending_crew_code IS NOT NULL THEN
    BEGIN
      j := club_crew_join(p_member, m.pending_crew_code);
      IF j ? 'error' THEN RAISE WARNING 'club_confirm_member crew: %', j->>'error'; END IF;
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'club_confirm_member crew: %', SQLERRM; END;
    UPDATE club_members SET pending_crew_code = NULL WHERE id = p_member;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.club_from_lead_capture() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE s uuid; c uuid; mid uuid; is_new boolean; cc text; BEGIN
  IF NEW.source IS DISTINCT FROM 'clube_newgang' OR NEW.email IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO s FROM portal_sites WHERE brand_key = 'newgang' AND active AND company_id = NEW.company_id ORDER BY created_at LIMIT 1;
  IF s IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO c FROM contacts WHERE lower(trim(email)) = lower(trim(NEW.email)) AND company_id = NEW.company_id LIMIT 1;
  mid := club_upsert_member(s, NEW.email, split_part(coalesce(NEW.name,''),' ',1), NEW.phone, c, NEW.raw->>'referral_code', 'formulario');
  IF mid IS NOT NULL AND NEW.raw ? 'terms_version' THEN
    PERFORM club_record_terms(mid, NEW.raw->>'terms_version', NEW.created_at);
  END IF;
  IF mid IS NOT NULL AND coalesce(NEW.raw->>'crew_code','') <> '' THEN
    BEGIN
      cc := upper(trim(NEW.raw->>'crew_code'));
      IF cc ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6,7}$' THEN
        IF EXISTS (SELECT 1 FROM club_members WHERE id = mid AND confirmed_at IS NOT NULL) THEN
          PERFORM club_crew_join(mid, cc);
        ELSE
          UPDATE club_members SET pending_crew_code = cc WHERE id = mid;
        END IF;
      ELSE RAISE WARNING 'club_from_lead_capture crew_code inválido'; END IF;
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'club_from_lead_capture crew: %', SQLERRM; END;
  END IF;
  IF mid IS NOT NULL THEN
    BEGIN
      SELECT (source = 'formulario' AND confirmed_at IS NULL AND created_at > now() - interval '1 minute')
        INTO is_new FROM club_members WHERE id = mid;
      IF is_new THEN
        PERFORM net.http_post(
          url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/newgang-portal',
          headers := jsonb_build_object('Content-Type','application/json'),
          body := jsonb_build_object('action','notify_member','member_id',mid));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'club_from_lead_capture notify: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'club_from_lead_capture: %', SQLERRM; RETURN NEW;
END $function$;
