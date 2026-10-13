-- D-ERP273: anulações de pontos ficam no histórico; nunca apagar linhas de club_points.
ALTER TABLE public.club_points ADD COLUMN IF NOT EXISTS reason text;
COMMENT ON COLUMN public.club_points.reason IS 'Motivo da anulação (só em rule_key=void).';

-- Linha "ativa" de (regra, ref base): a geração mais recente (ref = base ou base#N) sem anulação.
CREATE OR REPLACE FUNCTION public.club_points_active(p_member uuid, p_rule text, p_base text)
RETURNS public.club_points LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.* FROM club_points p
   WHERE p.member_id = p_member AND p.rule_key = p_rule AND (p.ref_id = p_base OR p.ref_id LIKE p_base || '#%')
     AND NOT EXISTS (SELECT 1 FROM club_points v WHERE v.member_id = p_member AND v.rule_key = 'void' AND v.ref_id = p_rule || ':' || p.ref_id)
   ORDER BY p.created_at DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.club_points_active(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Anula uma linha (idempotente pelo UNIQUE member+rule+ref).
CREATE OR REPLACE FUNCTION public._club_points_void_row(p_row public.club_points, p_reason text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int; BEGIN
  IF p_row.id IS NULL OR p_row.rule_key = 'void' OR p_row.points <= 0 THEN RETURN 0; END IF;
  INSERT INTO club_points(company_id, member_id, rule_key, points, ref_id, reason)
    VALUES (p_row.company_id, p_row.member_id, 'void', -p_row.points, p_row.rule_key || ':' || p_row.ref_id,
            coalesce(nullif(trim(p_reason),''), 'Pontos anulados'))
    ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public._club_points_void_row(public.club_points, text) FROM PUBLIC, anon, authenticated;

-- Estado desejado de (regra, ref base): quer pontos → garante 1 geração ativa (nova geração base#N se a anterior foi anulada);
-- não quer → anula a geração ativa com motivo. Nunca apaga.
CREATE OR REPLACE FUNCTION public.club_points_set(p_member uuid, p_rule text, p_base text, p_points int, p_want boolean, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a club_points; g int; ref text; BEGIN
  a := club_points_active(p_member, p_rule, p_base);
  IF p_want THEN
    IF a.id IS NOT NULL OR coalesce(p_points,0) <= 0 THEN RETURN; END IF;
    SELECT count(*) INTO g FROM club_points WHERE member_id = p_member AND rule_key = p_rule AND (ref_id = p_base OR ref_id LIKE p_base || '#%');
    ref := CASE WHEN g = 0 THEN p_base ELSE p_base || '#' || (g + 1) END;
    PERFORM club_award_fixed(p_member, p_rule, ref, p_points);
  ELSE
    PERFORM _club_points_void_row(a, p_reason);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.club_points_set(uuid, text, text, int, boolean, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.club_mission_sync_points(p_sub uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; why text; BEGIN
  SELECT x.*, m.points AS m_points, m.finalist_points, m.winner_points INTO s
    FROM club_mission_submissions x JOIN club_missions m ON m.id = x.mission_id WHERE x.id = p_sub;
  IF NOT FOUND THEN RETURN; END IF;
  why := CASE WHEN s.status = 'rejeitada' THEN coalesce(s.reject_reason, 'Submissão rejeitada')
              ELSE 'Estado da submissão alterado para ' || s.status END;
  PERFORM club_points_set(s.member_id, 'mission', p_sub::text, s.m_points, s.status IN ('aprovada','finalista','vencedora'), why);
  PERFORM club_points_set(s.member_id, 'mission_finalist', p_sub::text, s.finalist_points, s.status IN ('finalista','vencedora'), why);
  PERFORM club_points_set(s.member_id, 'mission_winner', p_sub::text, s.winner_points, s.status = 'vencedora', why);
END $$;
REVOKE ALL ON FUNCTION public.club_mission_sync_points(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.club_decide_guess(p_guess uuid, p_correct boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g record; pts int; BEGIN
  IF NOT public.portal_can_write() THEN RAISE EXCEPTION 'sem permissão'; END IF;
  SELECT cg.*, cm.site_id INTO g FROM club_guesses cg JOIN club_members cm ON cm.id = cg.member_id WHERE cg.id = p_guess;
  IF NOT FOUND OR NOT public.row_belongs_to_current_company(g.company_id) THEN RAISE EXCEPTION 'não encontrado'; END IF;
  UPDATE club_guesses SET status = CASE WHEN p_correct THEN 'certo' ELSE 'errado' END, decided_by = auth.uid(), decided_at = now() WHERE id = p_guess;
  SELECT points INTO pts FROM club_point_rules WHERE site_id = g.site_id AND rule_key = 'guess_correct' AND active;
  PERFORM club_points_set(g.member_id, 'guess_correct', g.reveal_id::text, pts, p_correct, 'Palpite marcado como errado');
END $$;

-- Anulação manual (CRM, fraude): motivo obrigatório; idempotente.
CREATE OR REPLACE FUNCTION public.club_points_void(p_points uuid[], p_reason text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r club_points; n int := 0; BEGIN
  IF NOT public.portal_can_write() THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'indica o motivo'; END IF;
  FOR r IN SELECT * FROM club_points WHERE id = ANY(p_points) LOOP
    IF NOT public.row_belongs_to_current_company(r.company_id) THEN RAISE EXCEPTION 'não encontrado'; END IF;
    n := n + _club_points_void_row(r, p_reason);
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.club_points_void(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_points_void(uuid[], text) TO authenticated;
