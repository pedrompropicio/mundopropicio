CREATE OR REPLACE FUNCTION public.portal_can_write() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin')
$$;

CREATE TABLE public.portal_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  domain text NOT NULL UNIQUE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  brand_key text NOT NULL,
  gtm_container_id text, site_pixel_id text, og_image_url text, favicon_url text,
  google_site_verification text, facebook_domain_verification text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.festival_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  brand_key text NOT NULL,
  year int NOT NULL, city text, venue text, edition_date date,
  lineup text[],
  videos jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(videos)='array'),
  gallery_urls text[] NOT NULL DEFAULT '{}' CHECK (coalesce(array_length(gallery_urls,1),0) <= 20),
  cover_url text,
  sort int NOT NULL DEFAULT 0, visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.festival_editions.videos IS '[{url, provider: youtube|instagram|vimeo, title}] ordenado; o 1.º é o aftermovie principal';
COMMENT ON COLUMN public.festival_editions.cover_url IS 'Capa explícita; se NULL o portal usa gallery_urls[1]';

CREATE TABLE public.club_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id uuid NOT NULL REFERENCES public.portal_sites(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  email text NOT NULL, phone text, first_name text,
  member_no int NOT NULL,
  referral_code text NOT NULL UNIQUE,
  referred_by_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  source text NOT NULL CHECK (source IN ('formulario','confirmacao_1_clique','importacao')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, member_no)
);
CREATE UNIQUE INDEX club_members_site_email_uq ON public.club_members(site_id, lower(trim(email)));
CREATE INDEX club_members_contact_idx ON public.club_members(contact_id);
CREATE TABLE public.club_point_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id uuid NOT NULL REFERENCES public.portal_sites(id) ON DELETE CASCADE,
  rule_key text NOT NULL, label text, points int NOT NULL, active boolean NOT NULL DEFAULT true,
  UNIQUE(site_id, rule_key)
);
CREATE TABLE public.club_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  rule_key text NOT NULL, points int NOT NULL, ref_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id, rule_key, ref_id)
);
CREATE TABLE public.club_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id uuid NOT NULL REFERENCES public.portal_sites(id) ON DELETE CASCADE,
  name text NOT NULL, min_points int NOT NULL, benefit text, UNIQUE(site_id, min_points)
);
CREATE TABLE public.club_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id uuid NOT NULL REFERENCES public.portal_sites(id) ON DELETE CASCADE,
  tier_label text NOT NULL, rank_from int, rank_to int, level_name text, reward text NOT NULL, sort int NOT NULL DEFAULT 0
);
CREATE TABLE public.club_guesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  reveal_id uuid NOT NULL REFERENCES public.event_lineup_reveals(id) ON DELETE CASCADE,
  guess text NOT NULL, status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','certo','errado')),
  decided_by uuid, decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(member_id, reveal_id)
);
CREATE TABLE public.club_attendance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  year int NOT NULL, status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','valido','recusado')),
  matched_source text, created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz,
  UNIQUE(member_id, year)
);
CREATE TABLE public.club_member_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES public.club_members(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.portal_sites(id) ON DELETE CASCADE,
  email text,
  token_hash text NOT NULL UNIQUE,
  purpose text NOT NULL DEFAULT 'access' CHECK (purpose IN ('access','buyer_confirm')),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.portal_rate_limits (
  bucket text NOT NULL, window_start timestamptz NOT NULL, hits int NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, window_start)
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['portal_sites','festival_editions','club_members','club_point_rules','club_points','club_levels','club_rewards','club_guesses','club_attendance_claims'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY company_isolation_%s ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id))', t, t);
    EXECUTE format('CREATE POLICY %s_select ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY %s_write_admin ON public.%I FOR ALL TO authenticated USING (public.portal_can_write()) WITH CHECK (public.portal_can_write())', t, t);
  END LOOP;
END $$;
GRANT ALL ON public.club_member_sessions TO service_role;
ALTER TABLE public.club_member_sessions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.portal_rate_limits TO service_role;
ALTER TABLE public.portal_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE VIEW public.portal_sites_public AS
  SELECT id, domain, event_id, brand_key, gtm_container_id, site_pixel_id, og_image_url, favicon_url,
         google_site_verification, facebook_domain_verification, content
    FROM public.portal_sites WHERE active;
CREATE VIEW public.festival_editions_public AS
  SELECT id, brand_key, year, city, venue, edition_date, lineup, videos, gallery_urls,
         coalesce(cover_url, gallery_urls[1]) AS cover_url, sort
    FROM public.festival_editions WHERE visible;
GRANT SELECT ON public.portal_sites_public, public.festival_editions_public TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.club_gen_referral_code() RETURNS text LANGUAGE plpgsql SET search_path=public AS $$
DECLARE a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; BEGIN
  LOOP
    c := ''; FOR i IN 1..7 LOOP c := c || substr(a, 1 + floor(random()*length(a))::int, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.club_members WHERE referral_code = c);
  END LOOP; RETURN c; END $$;

CREATE OR REPLACE FUNCTION public.club_award(p_member uuid, p_rule text, p_ref text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; pts int; n int; BEGIN
  SELECT * INTO m FROM club_members WHERE id = p_member; IF NOT FOUND THEN RETURN 0; END IF;
  SELECT points INTO pts FROM club_point_rules WHERE site_id = m.site_id AND rule_key = p_rule AND active;
  IF pts IS NULL THEN RETURN 0; END IF;
  INSERT INTO club_points(company_id, member_id, rule_key, points, ref_id)
    VALUES (m.company_id, p_member, p_rule, pts, p_ref) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN CASE WHEN n > 0 THEN pts ELSE 0 END;
END $$;

CREATE OR REPLACE FUNCTION public.club_upsert_member(p_site uuid, p_email text, p_first_name text, p_phone text,
  p_contact uuid, p_referral text, p_source text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; mid uuid; ref uuid; e text := lower(trim(p_email)); BEGIN
  IF e IS NULL OR e = '' THEN RETURN NULL; END IF;
  SELECT * INTO s FROM portal_sites WHERE id = p_site; IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT id INTO mid FROM club_members WHERE site_id = p_site AND (lower(trim(email)) = e
     OR (p_phone IS NOT NULL AND p_phone <> '' AND phone = p_phone)) ORDER BY created_at LIMIT 1;
  IF mid IS NOT NULL THEN
    UPDATE club_members SET contact_id = coalesce(contact_id, p_contact), first_name = coalesce(first_name, p_first_name),
      phone = coalesce(phone, nullif(p_phone,'')), updated_at = now() WHERE id = mid;
    RETURN mid;
  END IF;
  IF p_referral IS NOT NULL THEN
    SELECT id INTO ref FROM club_members WHERE site_id = p_site AND referral_code = upper(trim(p_referral));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('club_member_no:'||p_site));
  INSERT INTO club_members(company_id, site_id, contact_id, email, phone, first_name, member_no, referral_code, referred_by_member_id, source)
  VALUES (s.company_id, p_site, p_contact, e, nullif(p_phone,''), nullif(p_first_name,''),
          coalesce((SELECT max(member_no) FROM club_members WHERE site_id = p_site),0) + 1,
          club_gen_referral_code(), ref, p_source)
  RETURNING id INTO mid;
  RETURN mid;
END $$;

CREATE OR REPLACE FUNCTION public.club_confirm_member(p_member uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; BEGIN
  UPDATE club_members SET confirmed_at = coalesce(confirmed_at, now()), updated_at = now() WHERE id = p_member RETURNING * INTO m;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM club_award(p_member, 'join_confirmed', p_member::text);
  IF m.referred_by_member_id IS NOT NULL AND m.referred_by_member_id <> p_member THEN
    PERFORM club_award(m.referred_by_member_id, 'friend_joined', p_member::text);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.club_claim_attendance(p_member uuid, p_year int) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; st text; BEGIN
  SELECT cm.*, ps.brand_key INTO m FROM club_members cm JOIN portal_sites ps ON ps.id = cm.site_id WHERE cm.id = p_member;
  IF NOT FOUND THEN RETURN NULL; END IF;
  st := CASE WHEN EXISTS (SELECT 1 FROM fever_buyers f WHERE f.company_id = m.company_id
            AND f.edition_label = m.brand_key||'-'||p_year AND lower(trim(f.email)) = lower(trim(m.email))) THEN 'valido' ELSE 'pendente' END;
  INSERT INTO club_attendance_claims(company_id, member_id, year, status, matched_source, decided_at)
    VALUES (m.company_id, p_member, p_year, st, CASE WHEN st='valido' THEN 'fever_buyers' END, CASE WHEN st='valido' THEN now() END)
    ON CONFLICT (member_id, year) DO NOTHING;
  SELECT status INTO st FROM club_attendance_claims WHERE member_id = p_member AND year = p_year;
  IF st = 'valido' THEN PERFORM club_award(p_member, 'attended_year', p_year::text); END IF;
  RETURN st;
END $$;

CREATE OR REPLACE FUNCTION public.club_decide_guess(p_guess uuid, p_correct boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g record; BEGIN
  IF NOT public.portal_can_write() THEN RAISE EXCEPTION 'sem permissão'; END IF;
  SELECT * INTO g FROM club_guesses WHERE id = p_guess;
  IF NOT FOUND OR NOT public.row_belongs_to_current_company(g.company_id) THEN RAISE EXCEPTION 'não encontrado'; END IF;
  UPDATE club_guesses SET status = CASE WHEN p_correct THEN 'certo' ELSE 'errado' END, decided_by = auth.uid(), decided_at = now() WHERE id = p_guess;
  IF p_correct THEN PERFORM club_award(g.member_id, 'guess_correct', g.reveal_id::text);
  ELSE DELETE FROM club_points WHERE member_id = g.member_id AND rule_key = 'guess_correct' AND ref_id = g.reveal_id::text; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.club_decide_attendance(p_claim uuid, p_valid boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; BEGIN
  IF NOT public.portal_can_write() THEN RAISE EXCEPTION 'sem permissão'; END IF;
  SELECT * INTO c FROM club_attendance_claims WHERE id = p_claim;
  IF NOT FOUND OR NOT public.row_belongs_to_current_company(c.company_id) THEN RAISE EXCEPTION 'não encontrado'; END IF;
  UPDATE club_attendance_claims SET status = CASE WHEN p_valid THEN 'valido' ELSE 'recusado' END, matched_source = 'manual', decided_at = now() WHERE id = p_claim;
  IF p_valid THEN PERFORM club_award(c.member_id, 'attended_year', c.year::text); END IF;
END $$;

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
         (SELECT l.name FROM club_levels l WHERE l.site_id = p_site AND l.min_points <= r.pts ORDER BY l.min_points DESC LIMIT 1),
         r.rk
    FROM r ORDER BY r.rk LIMIT p_limit
$$;

CREATE OR REPLACE FUNCTION public.portal_rate_hit(p_bucket text, p_max int, p_window_seconds int) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds); h int; BEGIN
  INSERT INTO portal_rate_limits(bucket, window_start) VALUES (p_bucket, w)
    ON CONFLICT (bucket, window_start) DO UPDATE SET hits = portal_rate_limits.hits + 1 RETURNING hits INTO h;
  IF random() < 0.01 THEN DELETE FROM portal_rate_limits WHERE window_start < now() - interval '1 day'; END IF;
  RETURN h <= p_max;
END $$;

CREATE OR REPLACE FUNCTION public.club_from_lead_capture() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid; c uuid; BEGIN
  IF NEW.source IS DISTINCT FROM 'clube_newgang' OR NEW.email IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO s FROM portal_sites WHERE brand_key = 'newgang' AND active AND company_id = NEW.company_id ORDER BY created_at LIMIT 1;
  IF s IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO c FROM contacts WHERE lower(trim(email)) = lower(trim(NEW.email)) AND company_id = NEW.company_id LIMIT 1;
  PERFORM club_upsert_member(s, NEW.email, split_part(coalesce(NEW.name,''),' ',1), NEW.phone, c, NEW.raw->>'referral_code', 'formulario');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'club_from_lead_capture: %', SQLERRM; RETURN NEW;
END $$;
CREATE TRIGGER trg_club_from_lead_capture AFTER UPDATE OF processed ON public.lead_capture
  FOR EACH ROW WHEN (NEW.processed IS TRUE AND OLD.processed IS DISTINCT FROM TRUE) EXECUTE FUNCTION public.club_from_lead_capture();

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['club_gen_referral_code()','club_award(uuid,text,text)','club_upsert_member(uuid,text,text,text,uuid,text,text)','club_confirm_member(uuid)','club_claim_attendance(uuid,int)','portal_rate_hit(text,int,int)','club_from_lead_capture()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['club_decide_guess(uuid,boolean)','club_decide_attendance(uuid,boolean)','club_ranking(uuid,int)','portal_can_write()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;