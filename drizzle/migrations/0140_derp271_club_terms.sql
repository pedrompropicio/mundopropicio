-- D-ERP271 — Regulamento do Clube Newgang versionado no CRM + aceitação por membro.
CREATE TABLE public.club_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.portal_sites(id) ON DELETE CASCADE,
  version int NOT NULL CHECK (version > 0),
  body_md text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','publicada')),
  published_at timestamptz,
  published_by uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, version),
  CHECK ((status = 'publicada') = (published_at IS NOT NULL))
);
CREATE UNIQUE INDEX club_terms_one_draft ON public.club_terms(site_id) WHERE status = 'rascunho';
CREATE INDEX club_terms_site_pub ON public.club_terms(site_id, version DESC) WHERE status = 'publicada';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_terms TO authenticated;
GRANT ALL ON public.club_terms TO service_role;
ALTER TABLE public.club_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_isolation_club_terms ON public.club_terms AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));
CREATE POLICY club_terms_select ON public.club_terms FOR SELECT TO authenticated USING (true);
CREATE POLICY club_terms_write_draft ON public.club_terms FOR ALL TO authenticated
  USING (public.portal_can_write() AND status = 'rascunho')
  WITH CHECK (public.portal_can_write() AND status = 'rascunho');

ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS terms_version int;
ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

CREATE OR REPLACE FUNCTION public.club_terms_publish(p_site uuid, p_body text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; v int; d uuid; BEGIN
  IF NOT public.portal_can_write() THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF coalesce(trim(p_body),'') = '' THEN RAISE EXCEPTION 'regulamento vazio'; END IF;
  SELECT * INTO s FROM portal_sites WHERE id = p_site;
  IF NOT FOUND OR NOT public.row_belongs_to_current_company(s.company_id) THEN RAISE EXCEPTION 'site inválido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('club_terms:'||p_site));
  SELECT id, version INTO d, v FROM club_terms WHERE site_id = p_site AND status = 'rascunho';
  IF d IS NOT NULL THEN
    UPDATE club_terms SET body_md = p_body, status = 'publicada', published_at = now(), published_by = auth.uid(), updated_at = now() WHERE id = d;
  ELSE
    v := coalesce((SELECT max(version) FROM club_terms WHERE site_id = p_site), 0) + 1;
    INSERT INTO club_terms(company_id, site_id, version, body_md, status, published_at, published_by, created_by)
      VALUES (s.company_id, p_site, v, p_body, 'publicada', now(), auth.uid(), auth.uid());
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.club_terms_publish(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_terms_publish(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.club_record_terms(p_member uuid, p_version text, p_at timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v int; BEGIN
  IF p_member IS NULL OR p_version IS NULL OR trim(p_version) !~ '^[0-9]{1,6}$' THEN
    IF p_version IS NOT NULL THEN RAISE WARNING 'club_record_terms: versão inválida %', p_version; END IF;
    RETURN false;
  END IF;
  v := trim(p_version)::int;
  IF NOT EXISTS (SELECT 1 FROM club_terms t JOIN club_members m ON m.site_id = t.site_id
                  WHERE m.id = p_member AND t.version = v AND t.status = 'publicada') THEN
    RAISE WARNING 'club_record_terms: versão % não publicada', v; RETURN false;
  END IF;
  UPDATE club_members SET terms_version = v, terms_accepted_at = coalesce(p_at, now()), updated_at = now() WHERE id = p_member;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'club_record_terms: %', SQLERRM; RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.club_record_terms(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.club_from_lead_capture() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid; c uuid; mid uuid; is_new boolean; BEGIN
  IF NEW.source IS DISTINCT FROM 'clube_newgang' OR NEW.email IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO s FROM portal_sites WHERE brand_key = 'newgang' AND active AND company_id = NEW.company_id ORDER BY created_at LIMIT 1;
  IF s IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO c FROM contacts WHERE lower(trim(email)) = lower(trim(NEW.email)) AND company_id = NEW.company_id LIMIT 1;
  mid := club_upsert_member(s, NEW.email, split_part(coalesce(NEW.name,''),' ',1), NEW.phone, c, NEW.raw->>'referral_code', 'formulario');
  IF mid IS NOT NULL AND NEW.raw ? 'terms_version' THEN
    PERFORM club_record_terms(mid, NEW.raw->>'terms_version', NEW.created_at);
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
END $$;