-- #328 — PENDENTE. NÃO APLICADO EM LIVE. Aplicar só com "Sim" do Pedro, por migração versionada.
-- Âmbito: (1) inscrição idempotente/atómica por site+email normalizado; (2) telefone deixa de
-- atribuir identidade; (3) Crew cheia/inválida na confirmação deixa pendência recuperável.
-- Não altera pontos, regras (max 6 / min 4), bónus por edição (#327) nem dados existentes.
-- Reversão: supabase/manual/20261016_issue328.ROLLBACK.sql (não apaga histórico).
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE (ACL das funções existentes preservada).

ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS pending_crew_status text,
  ADD COLUMN IF NOT EXISTS pending_crew_checked_at timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'club_members_pending_crew_status_chk') THEN
    ALTER TABLE public.club_members ADD CONSTRAINT club_members_pending_crew_status_chk
      CHECK (pending_crew_status IS NULL OR pending_crew_status IN ('crew_full','crew_not_found','error'));
  END IF;
END $$;
COMMENT ON COLUMN public.club_members.pending_crew_status IS '#328: resultado da tentativa única de aplicar pending_crew_code na confirmação (NULL = por tentar). Com valor, a confirmação não volta a tentar; só club_crew_pending(retry|dismiss).';
COMMENT ON COLUMN public.club_members.pending_crew_checked_at IS '#328: quando pending_crew_status foi definido.';

CREATE OR REPLACE FUNCTION public.club_upsert_member(p_site uuid, p_email text, p_first_name text, p_phone text,
  p_contact uuid, p_referral text, p_source text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; mid uuid; ref uuid; e text := lower(trim(p_email)); BEGIN
  IF e IS NULL OR e = '' THEN RETURN NULL; END IF;
  SELECT * INTO s FROM portal_sites WHERE id = p_site; IF NOT FOUND THEN RETURN NULL; END IF;
  -- #328: identidade = site + email normalizado (telefone nunca identifica). Lock ANTES da procura.
  PERFORM pg_advisory_xact_lock(hashtext('club_member_email:'||p_site||':'||e));
  SELECT id INTO mid FROM club_members WHERE site_id = p_site AND lower(trim(email)) = e;
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
  ON CONFLICT (site_id, (lower(trim(email)))) DO NOTHING
  RETURNING id INTO mid;
  IF mid IS NULL THEN
    SELECT id INTO mid FROM club_members WHERE site_id = p_site AND lower(trim(email)) = e;
  END IF;
  RETURN mid;
END $$;

CREATE OR REPLACE FUNCTION public.club_confirm_member(p_member uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; j jsonb; st text; BEGIN
  UPDATE club_members SET confirmed_at = coalesce(confirmed_at, now()), updated_at = now() WHERE id = p_member RETURNING * INTO m;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM club_award(p_member, 'join_confirmed', p_member::text);
  IF m.referred_by_member_id IS NOT NULL AND m.referred_by_member_id <> p_member THEN
    PERFORM club_award(m.referred_by_member_id, 'friend_joined', p_member::text);
  END IF;
  -- #328: uma única tentativa; falha fica recuperável (código preservado + estado), sem novas tentativas automáticas.
  IF m.pending_crew_code IS NOT NULL AND m.pending_crew_status IS NULL THEN
    BEGIN
      j := club_crew_join(p_member, m.pending_crew_code);
      st := j->>'error';
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'club_confirm_member crew: %', SQLERRM; st := 'error'; END;
    IF st IS NULL OR st = 'already_in_crew' THEN
      UPDATE club_members SET pending_crew_code = NULL, pending_crew_status = NULL, pending_crew_checked_at = NULL WHERE id = p_member;
    ELSE
      UPDATE club_members SET pending_crew_status = CASE WHEN st IN ('crew_full','crew_not_found') THEN st ELSE 'error' END,
        pending_crew_checked_at = now() WHERE id = p_member;
    END IF;
  END IF;
END $$;

-- Pendência de Crew do próprio membro (sessão validada pela edge function). Ações: status | retry | dismiss.
-- Não devolve emails nem tokens. retry = uma tentativa por pedido explícito do utilizador.
CREATE OR REPLACE FUNCTION public.club_crew_pending(p_member uuid, p_action text DEFAULT 'status') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; j jsonb; st text; nm text; BEGIN
  SELECT * INTO m FROM club_members WHERE id = p_member FOR UPDATE;
  IF NOT FOUND OR m.confirmed_at IS NULL THEN RETURN jsonb_build_object('error','no_session'); END IF;
  IF p_action NOT IN ('status','retry','dismiss') THEN RETURN jsonb_build_object('error','action'); END IF;
  IF m.pending_crew_code IS NULL OR m.pending_crew_status IS NULL THEN RETURN jsonb_build_object('pending', NULL); END IF;
  IF p_action = 'dismiss' OR EXISTS (SELECT 1 FROM club_crew_members WHERE site_id = m.site_id AND member_id = p_member) THEN
    UPDATE club_members SET pending_crew_code = NULL, pending_crew_status = NULL, pending_crew_checked_at = NULL WHERE id = p_member;
    RETURN jsonb_build_object('pending', NULL);
  END IF;
  IF p_action = 'retry' THEN
    j := club_crew_join(p_member, m.pending_crew_code);
    st := j->>'error';
    IF st IS NULL OR st = 'already_in_crew' THEN
      UPDATE club_members SET pending_crew_code = NULL, pending_crew_status = NULL, pending_crew_checked_at = NULL WHERE id = p_member;
      RETURN jsonb_build_object('pending', NULL, 'crew_id', j->'crew_id');
    END IF;
    m.pending_crew_status := CASE WHEN st IN ('crew_full','crew_not_found') THEN st ELSE 'error' END;
    UPDATE club_members SET pending_crew_status = m.pending_crew_status, pending_crew_checked_at = now() WHERE id = p_member;
  END IF;
  SELECT name INTO nm FROM club_crews WHERE site_id = m.site_id AND code = m.pending_crew_code;
  RETURN jsonb_build_object('pending', jsonb_build_object('status', m.pending_crew_status, 'code', m.pending_crew_code, 'crew_name', nm));
END $$;
REVOKE ALL ON FUNCTION public.club_crew_pending(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_crew_pending(uuid, text) TO service_role;
