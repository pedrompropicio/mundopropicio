-- #328 — APLICADO EM LIVE em 2026-10-16 via drizzle/migrations/0176_issue328_club_identity_crew_pending.sql. NÃO REAPLICAR (rasto: migração 0176).
-- Âmbito: (1) inscrição idempotente/atómica por site+email normalizado; (2) telefone deixa de
-- atribuir identidade; (3) Crew cheia/inválida na confirmação deixa pendência recuperável.
-- Não altera pontos, regras (max 6 / min 4), bónus por edição (#327) nem dados existentes.
-- Reversão: supabase/manual/20261016_issue328.ROLLBACK.sql (não apaga histórico).
-- (4) [revisão 2] membro JÁ confirmado que reenvia convite com Crew cheia/inválida/outra Crew: pendência
--     recuperável em club_from_lead_capture (só o bloco Crew muda; guardas de ingestão #321, welcome,
--     termos, notify e processed ficam verbatim de Live md5 25201a26499f432c4b7e2ca6274935c2).
-- (5) [revisão 2] club_crew_pending: p_action NULL recusado; retry trata exceção como resultado recuperável.
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE (ACL das funções existentes preservada).

ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS pending_crew_status text,
  ADD COLUMN IF NOT EXISTS pending_crew_checked_at timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'club_members_pending_crew_status_chk') THEN
    ALTER TABLE public.club_members ADD CONSTRAINT club_members_pending_crew_status_chk
      CHECK (pending_crew_status IS NULL OR pending_crew_status IN ('crew_full','crew_not_found','already_in_crew','error'));
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
-- ATENÇÃO: é uma função de ESCRITA (FOR UPDATE). 'status' também pode LIMPAR a pendência quando ela
-- deixou de fazer sentido (membro já está na Crew do código, ou já está noutra Crew e o estado não é
-- 'already_in_crew'). Só deve ser chamada com o member_id da sessão autenticada (edge), nunca do payload.
CREATE OR REPLACE FUNCTION public.club_crew_pending(p_member uuid, p_action text DEFAULT 'status') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; j jsonb; st text; nm text; in_same boolean; in_any boolean; BEGIN
  IF p_action IS NULL OR p_action NOT IN ('status','retry','dismiss') THEN RETURN jsonb_build_object('error','action'); END IF;
  SELECT * INTO m FROM club_members WHERE id = p_member FOR UPDATE;
  IF NOT FOUND OR m.confirmed_at IS NULL THEN RETURN jsonb_build_object('error','no_session'); END IF;
  IF m.pending_crew_code IS NULL OR m.pending_crew_status IS NULL THEN RETURN jsonb_build_object('pending', NULL); END IF;
  in_any := EXISTS (SELECT 1 FROM club_crew_members WHERE site_id = m.site_id AND member_id = p_member);
  in_same := EXISTS (SELECT 1 FROM club_crew_members cm JOIN club_crews c ON c.id = cm.crew_id
                     WHERE cm.site_id = m.site_id AND cm.member_id = p_member AND c.code = m.pending_crew_code);
  IF p_action = 'dismiss' OR in_same OR (in_any AND m.pending_crew_status <> 'already_in_crew') THEN
    UPDATE club_members SET pending_crew_code = NULL, pending_crew_status = NULL, pending_crew_checked_at = NULL WHERE id = p_member;
    RETURN jsonb_build_object('pending', NULL);
  END IF;
  IF p_action = 'retry' THEN
    BEGIN
      j := club_crew_join(p_member, m.pending_crew_code);
      st := j->>'error';
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'club_crew_pending retry: %', SQLERRM; j := NULL; st := 'error'; END;
    IF st IS NULL THEN
      UPDATE club_members SET pending_crew_code = NULL, pending_crew_status = NULL, pending_crew_checked_at = NULL WHERE id = p_member;
      RETURN jsonb_build_object('pending', NULL, 'crew_id', j->'crew_id');
    END IF;
    m.pending_crew_status := CASE WHEN st IN ('crew_full','crew_not_found','already_in_crew') THEN st ELSE 'error' END;
    UPDATE club_members SET pending_crew_status = m.pending_crew_status, pending_crew_checked_at = now() WHERE id = p_member;
  END IF;
  SELECT name INTO nm FROM club_crews WHERE site_id = m.site_id AND code = m.pending_crew_code;
  RETURN jsonb_build_object('pending', jsonb_build_object('status', m.pending_crew_status, 'code', m.pending_crew_code, 'crew_name', nm));
END $$;
REVOKE ALL ON FUNCTION public.club_crew_pending(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_crew_pending(uuid, text) TO service_role;

-- (4) Trigger de captura: igual a Live (md5 25201a26…) exceto DECLARE (+j,st,nc) e bloco Crew.
-- Membro confirmado: tentativa única; falha => código normalizado + estado + checked_at (substitui o par
-- anterior, nunca herda erro antigo). Não confirmado: novo código substitui e limpa estado anterior.
-- Código com formato inválido: guardado normalizado (A-Z0-9, ≤7) com estado crew_not_found.
CREATE OR REPLACE FUNCTION public.club_from_lead_capture() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid; c uuid; mid uuid; is_new boolean; cc text; j jsonb; st text; BEGIN
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
      IF cc !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6,7}$' THEN
        RAISE WARNING 'club_from_lead_capture crew_code inválido';
        cc := left(regexp_replace(cc, '[^A-Z0-9]', '', 'g'), 7);
        IF cc <> '' THEN
          UPDATE club_members SET pending_crew_code = cc, pending_crew_status = 'crew_not_found', pending_crew_checked_at = now() WHERE id = mid;
        END IF;
      ELSIF EXISTS (SELECT 1 FROM club_members WHERE id = mid AND confirmed_at IS NOT NULL) THEN
        BEGIN
          j := club_crew_join(mid, cc);
          st := j->>'error';
        EXCEPTION WHEN OTHERS THEN RAISE WARNING 'club_from_lead_capture crew join: %', SQLERRM; st := 'error'; END;
        IF st IS NULL OR (st = 'already_in_crew' AND EXISTS (SELECT 1 FROM club_crew_members cm JOIN club_crews k ON k.id = cm.crew_id WHERE cm.member_id = mid AND k.code = cc)) THEN
          UPDATE club_members SET pending_crew_code = NULL, pending_crew_status = NULL, pending_crew_checked_at = NULL WHERE id = mid;
        ELSE
          UPDATE club_members SET pending_crew_code = cc,
            pending_crew_status = CASE WHEN st IN ('crew_full','crew_not_found','already_in_crew') THEN st ELSE 'error' END,
            pending_crew_checked_at = now() WHERE id = mid;
        END IF;
      ELSE
        UPDATE club_members SET pending_crew_code = cc, pending_crew_status = NULL, pending_crew_checked_at = NULL WHERE id = mid;
      END IF;
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
END $$;
