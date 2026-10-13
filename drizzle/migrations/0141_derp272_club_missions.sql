-- D-ERP272 — Clube Newgang: missões de criativos (fase 1).
CREATE TABLE public.club_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.portal_sites(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'postar' CHECK (kind IN ('postar','desafio')),
  title text NOT NULL,
  description text,
  network text NOT NULL DEFAULT 'qualquer' CHECK (network IN ('instagram','tiktok','qualquer')),
  points int NOT NULL DEFAULT 0 CHECK (points >= 0),
  proof_type text NOT NULL DEFAULT 'link' CHECK (proof_type IN ('link','imagem','link_ou_imagem')),
  approval text NOT NULL DEFAULT 'manual' CHECK (approval IN ('automatica','manual')),
  mention text, hashtag text, caption_suggestion text,
  assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  starts_at timestamptz, ends_at timestamptz,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','ativa','encerrada')),
  sort int NOT NULL DEFAULT 0,
  finalist_points int CHECK (finalist_points IS NULL OR finalist_points >= 0),
  winner_points int CHECK (winner_points IS NULL OR winner_points >= 0),
  judging_until timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'postar' OR approval = 'manual'),
  CHECK (kind = 'desafio' OR (finalist_points IS NULL AND winner_points IS NULL AND judging_until IS NULL)),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CHECK (jsonb_typeof(assets) = 'array')
);
CREATE INDEX club_missions_site ON public.club_missions(site_id, status, sort);

CREATE TABLE public.club_mission_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.club_missions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  proof_url text, proof_image_path text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','rejeitada','finalista','vencedora')),
  auto_approved boolean NOT NULL DEFAULT false,
  reject_reason text,
  reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (proof_url IS NOT NULL OR proof_image_path IS NOT NULL)
);
-- Uma submissão ativa por membro por missão (rejeitadas ficam no histórico).
CREATE UNIQUE INDEX club_mission_sub_active_uq ON public.club_mission_submissions(mission_id, member_id) WHERE status <> 'rejeitada';
CREATE INDEX club_mission_sub_url ON public.club_mission_submissions(proof_url) WHERE proof_url IS NOT NULL;
CREATE INDEX club_mission_sub_queue ON public.club_mission_submissions(mission_id, status, created_at);

ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS instagram_handle text;
ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS tiktok_handle text;
ALTER TABLE public.club_members ADD CONSTRAINT club_members_instagram_handle_fmt CHECK (instagram_handle IS NULL OR instagram_handle ~ '^[a-z0-9._]{1,30}$');
ALTER TABLE public.club_members ADD CONSTRAINT club_members_tiktok_handle_fmt CHECK (tiktok_handle IS NULL OR tiktok_handle ~ '^[a-z0-9._]{2,24}$');

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['club_missions','club_mission_submissions'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY company_isolation_%s ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id))', t, t);
    EXECUTE format('CREATE POLICY %s_select ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY %s_write_admin ON public.%I FOR ALL TO authenticated USING (public.portal_can_write()) WITH CHECK (public.portal_can_write())', t, t);
  END LOOP;
END $$;

-- Pontos pelo motor existente (club_points, UNIQUE member+rule+ref), com valor definido pela missão.
CREATE OR REPLACE FUNCTION public.club_award_fixed(p_member uuid, p_rule text, p_ref text, p_points int) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; n int; BEGIN
  IF coalesce(p_points,0) <= 0 THEN RETURN 0; END IF;
  SELECT * INTO m FROM club_members WHERE id = p_member; IF NOT FOUND THEN RETURN 0; END IF;
  INSERT INTO club_points(company_id, member_id, rule_key, points, ref_id)
    VALUES (m.company_id, p_member, p_rule, p_points, p_ref) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN CASE WHEN n > 0 THEN p_points ELSE 0 END;
END $$;
REVOKE ALL ON FUNCTION public.club_award_fixed(uuid, text, text, int) FROM PUBLIC, anon, authenticated;

-- Pontos da submissão = função do estado: aprovada → mission; finalista → + mission_finalist; vencedora → + mission_winner.
CREATE OR REPLACE FUNCTION public.club_mission_sync_points(p_sub uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; ok boolean; fin boolean; win boolean; BEGIN
  SELECT x.*, m.points AS m_points, m.finalist_points, m.winner_points INTO s
    FROM club_mission_submissions x JOIN club_missions m ON m.id = x.mission_id WHERE x.id = p_sub;
  IF NOT FOUND THEN RETURN; END IF;
  ok  := s.status IN ('aprovada','finalista','vencedora');
  fin := s.status IN ('finalista','vencedora');
  win := s.status = 'vencedora';
  IF ok THEN PERFORM club_award_fixed(s.member_id, 'mission', p_sub::text, s.m_points);
  ELSE DELETE FROM club_points WHERE member_id = s.member_id AND rule_key = 'mission' AND ref_id = p_sub::text; END IF;
  IF fin THEN PERFORM club_award_fixed(s.member_id, 'mission_finalist', p_sub::text, s.finalist_points);
  ELSE DELETE FROM club_points WHERE member_id = s.member_id AND rule_key = 'mission_finalist' AND ref_id = p_sub::text; END IF;
  IF win THEN PERFORM club_award_fixed(s.member_id, 'mission_winner', p_sub::text, s.winner_points);
  ELSE DELETE FROM club_points WHERE member_id = s.member_id AND rule_key = 'mission_winner' AND ref_id = p_sub::text; END IF;
END $$;
REVOKE ALL ON FUNCTION public.club_mission_sync_points(uuid) FROM PUBLIC, anon, authenticated;

-- Submissão do membro (chamada pela newgang-portal com service_role). Devolve {status, submission_id} ou {error}.
CREATE OR REPLACE FUNCTION public.club_mission_submit(p_member uuid, p_mission uuid, p_url text, p_image text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE mb record; ms record; host text; url text := nullif(trim(p_url),''); img text := nullif(trim(p_image),'');
  st text; sid uuid; BEGIN
  SELECT * INTO mb FROM club_members WHERE id = p_member;
  IF NOT FOUND OR mb.confirmed_at IS NULL THEN RETURN jsonb_build_object('error','no_session'); END IF;
  SELECT * INTO ms FROM club_missions WHERE id = p_mission AND site_id = mb.site_id;
  IF NOT FOUND OR ms.status <> 'ativa' THEN RETURN jsonb_build_object('error','mission'); END IF;
  IF (ms.starts_at IS NOT NULL AND ms.starts_at > now()) OR (ms.ends_at IS NOT NULL AND ms.ends_at <= now()) THEN
    RETURN jsonb_build_object('error','closed'); END IF;
  IF ms.proof_type = 'link' AND url IS NULL THEN RETURN jsonb_build_object('error','proof_link'); END IF;
  IF ms.proof_type = 'imagem' AND img IS NULL THEN RETURN jsonb_build_object('error','proof_image'); END IF;
  IF ms.proof_type = 'link' THEN img := NULL; ELSIF ms.proof_type = 'imagem' THEN url := NULL; END IF;
  IF url IS NULL AND img IS NULL THEN RETURN jsonb_build_object('error','proof'); END IF;
  IF url IS NOT NULL THEN
    host := lower(substring(url from '^https://([^/?#:]+)'));
    IF host IS NULL THEN RETURN jsonb_build_object('error','url'); END IF;
    host := regexp_replace(host, '^(www\.|m\.|vm\.|vt\.)', '');
    IF NOT (
      (ms.network = 'instagram' AND host = 'instagram.com') OR
      (ms.network = 'tiktok' AND host = 'tiktok.com') OR
      (ms.network = 'qualquer' AND host IN ('instagram.com','tiktok.com','youtube.com','youtu.be','x.com','twitter.com','facebook.com','fb.watch'))
    ) THEN RETURN jsonb_build_object('error','network'); END IF;
    IF EXISTS (SELECT 1 FROM club_mission_submissions WHERE proof_url = url AND member_id <> p_member) THEN
      RETURN jsonb_build_object('error','duplicate'); END IF;
  END IF;
  IF img IS NOT NULL AND (img NOT LIKE mb.company_id::text || '/' || p_member::text || '/%'
       OR lower(img) !~ '\.(jpg|jpeg|png|webp)$' OR img LIKE '%..%') THEN
    RETURN jsonb_build_object('error','image'); END IF;
  IF EXISTS (SELECT 1 FROM club_mission_submissions WHERE mission_id = p_mission AND member_id = p_member AND status <> 'rejeitada') THEN
    RETURN jsonb_build_object('error','already_submitted'); END IF;
  st := CASE WHEN ms.kind = 'postar' AND ms.approval = 'automatica' THEN 'aprovada' ELSE 'pendente' END;
  INSERT INTO club_mission_submissions(company_id, mission_id, member_id, proof_url, proof_image_path, status, auto_approved, reviewed_at)
    VALUES (mb.company_id, p_mission, p_member, url, img, st, st = 'aprovada', CASE WHEN st = 'aprovada' THEN now() END)
    RETURNING id INTO sid;
  PERFORM club_mission_sync_points(sid);
  RETURN jsonb_build_object('status', st, 'submission_id', sid);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('error','already_submitted');
END $$;
REVOKE ALL ON FUNCTION public.club_mission_submit(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_mission_submit(uuid, uuid, text, text) TO service_role;

-- Moderação (CRM): aprovar/rejeitar/finalista/vencedora, em lote; pontos acompanham o estado.
CREATE OR REPLACE FUNCTION public.club_mission_review(p_subs uuid[], p_status text, p_reason text DEFAULT NULL) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; n int := 0; BEGIN
  IF NOT public.portal_can_write() THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF p_status NOT IN ('pendente','aprovada','rejeitada','finalista','vencedora') THEN RAISE EXCEPTION 'estado inválido'; END IF;
  IF p_status = 'rejeitada' AND coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'indica o motivo'; END IF;
  FOR r IN SELECT x.id, x.company_id, x.mission_id, x.member_id, x.status, m.kind FROM club_mission_submissions x
             JOIN club_missions m ON m.id = x.mission_id WHERE x.id = ANY(p_subs) LOOP
    IF NOT public.row_belongs_to_current_company(r.company_id) THEN RAISE EXCEPTION 'não encontrado'; END IF;
    IF p_status IN ('finalista','vencedora') AND r.kind <> 'desafio' THEN RAISE EXCEPTION 'finalista/vencedora só em desafios'; END IF;
    IF r.status = 'rejeitada' AND p_status <> 'rejeitada' AND EXISTS (SELECT 1 FROM club_mission_submissions
         WHERE mission_id = r.mission_id AND member_id = r.member_id AND status <> 'rejeitada' AND id <> r.id) THEN
      RAISE EXCEPTION 'o membro já tem outra submissão ativa nesta missão'; END IF;
    UPDATE club_mission_submissions SET status = p_status,
      reject_reason = CASE WHEN p_status = 'rejeitada' THEN trim(p_reason) ELSE NULL END,
      reviewed_by = auth.uid(), reviewed_at = now() WHERE id = r.id;
    PERFORM club_mission_sync_points(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.club_mission_review(uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_mission_review(uuid[], text, text) TO authenticated;

-- Storage: criativos (público, escrita pela equipa da empresa) e provas (privado, só service_role escreve; CRM lê).
CREATE POLICY club_mission_assets_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'club-mission-assets' AND public.portal_can_write() AND ((storage.foldername(name))[1])::uuid = public.current_company_id());
CREATE POLICY club_mission_assets_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'club-mission-assets' AND public.portal_can_write() AND ((storage.foldername(name))[1])::uuid = public.current_company_id());
CREATE POLICY club_mission_assets_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'club-mission-assets' AND public.portal_can_write() AND ((storage.foldername(name))[1])::uuid = public.current_company_id());
CREATE POLICY club_proofs_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'club-proofs' AND public.portal_can_write() AND ((storage.foldername(name))[1])::uuid = public.current_company_id());