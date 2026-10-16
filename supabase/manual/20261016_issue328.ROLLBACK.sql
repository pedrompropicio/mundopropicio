-- #328 — REVERSÃO do 20261016_issue328.PENDENTE.sql. NÃO APLICADO. Só com "Sim" do Pedro.
-- Repõe club_upsert_member (0120) e club_confirm_member (0143) VERBATIM (md5 = snapshot Live #326)
-- e remove a função nova. Colunas novas ficam (sem DROP: não apagar histórico), marcadas DEPRECATED.
-- Atenção: membros com pending_crew_status preenchido mantêm pending_crew_code; a função antiga não
-- volta a tentar (já confirmados). Pontos e membros não são tocados.
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

DROP FUNCTION IF EXISTS public.club_crew_pending(uuid, text);
COMMENT ON COLUMN public.club_members.pending_crew_status IS 'DEPRECATED: #328 revertido.';
COMMENT ON COLUMN public.club_members.pending_crew_checked_at IS 'DEPRECATED: #328 revertido.';
