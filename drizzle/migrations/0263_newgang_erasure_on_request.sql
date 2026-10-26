-- R2 passo 4 (26/10): apagamento imediato a pedido/cancelamento de um membro do Clube Newgang.
-- Só service_role. dry_run=true por omissão (não escreve nada). Idempotente via club_members.erased_at.
ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS erased_at timestamptz;
COMMENT ON COLUMN public.club_members.erased_at IS 'Apagamento RGPD: linha mantida só como registo mínimo anónimo (pontos/missões anonimizados).';

ALTER TABLE public.suppressed_emails DROP CONSTRAINT IF EXISTS suppressed_emails_reason_check;
ALTER TABLE public.suppressed_emails ADD CONSTRAINT suppressed_emails_reason_check
  CHECK (reason = ANY (ARRAY['unsubscribe','bounce','complaint','test','manual','erasure_request','retention_36m']));

CREATE TABLE IF NOT EXISTS public.club_retention_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL,
  old_member_id uuid NOT NULL,
  email_sha256 text NOT NULL CHECK (email_sha256 ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL CHECK (reason IN ('erasure_request','retention_36m')),
  tables_affected jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.club_retention_log TO service_role;
REVOKE ALL ON public.club_retention_log FROM PUBLIC, anon, authenticated;
ALTER TABLE public.club_retention_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.club_member_erase(p_member_id uuid, p_reason text DEFAULT 'erasure_request', p_dry_run boolean DEFAULT true, p_run_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m public.club_members; h text; ph text; run uuid := coalesce(p_run_id, gen_random_uuid()); c jsonb; n int;
 cnt jsonb := '{}'::jsonb; other_members int;
BEGIN
 IF p_reason IS NULL OR p_reason NOT IN ('erasure_request','retention_36m') THEN RAISE EXCEPTION 'erase_reason'; END IF;
 SELECT * INTO m FROM public.club_members WHERE id = p_member_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','not_member'); END IF;
 PERFORM public._club_site_lock(m.site_id, false);
 SELECT * INTO m FROM public.club_members WHERE id = p_member_id FOR UPDATE;
 IF m.erased_at IS NOT NULL THEN RETURN jsonb_build_object('status','already_erased','erased_at',m.erased_at); END IF;
 h := encode(sha256(convert_to(lower(btrim(m.email)),'UTF8')),'hex');
 ph := 'erased+' || m.id::text || '@invalid';
 SELECT count(*) INTO other_members FROM public.club_members WHERE contact_id = m.contact_id AND id <> m.id;

 cnt := jsonb_build_object(
  'club_members', 1,
  'contacts', CASE WHEN m.contact_id IS NOT NULL AND other_members = 0 AND EXISTS(SELECT 1 FROM public.contacts WHERE id=m.contact_id) THEN 1 ELSE 0 END,
  'club_member_sessions', (SELECT count(*) FROM public.club_member_sessions WHERE member_id=m.id OR (site_id=m.site_id AND lower(btrim(email))=lower(btrim(m.email)))),
  'club_wallet_passes', (SELECT count(*) FROM public.club_wallet_passes WHERE member_id=m.id),
  'club_member_profiles', (SELECT count(*) FROM public.club_member_profiles WHERE member_id=m.id),
  'club_mission_submissions', (SELECT count(*) FROM public.club_mission_submissions WHERE member_id=m.id),
  'club_points', (SELECT count(*) FROM public.club_points WHERE member_id=m.id),
  'email_unsubscribe_tokens', (SELECT count(*) FROM public.email_unsubscribe_tokens WHERE company_id=m.company_id AND lower(btrim(email))=lower(btrim(m.email))),
  'email_send_log', (SELECT count(*) FROM public.email_send_log WHERE lower(btrim(recipient_email))=lower(btrim(m.email))),
  'suppressed_emails_plain_removed', (SELECT count(*) FROM public.suppressed_emails WHERE company_id=m.company_id AND email=lower(btrim(m.email))),
  'consents_revoked', 3);
 IF coalesce(p_dry_run, true) THEN
  RETURN jsonb_build_object('status','dry_run','run_id',run,'email_sha256',h,'tables_affected',cnt);
 END IF;

 -- 1) Consentimentos revogados nos históricos (append-only) antes de apagar o telefone.
 PERFORM public._club332_email_append(m.id, m.site_id, 'revoked', run, 'email_unsubscribe');
 IF EXISTS(SELECT 1 FROM public.club_member_whatsapp_consents WHERE member_id=m.id) THEN
  PERFORM public._club332_whatsapp_append(m.id, m.site_id, 'revoked', run, 'club_session');
 END IF;
 PERFORM public._club332_ads_append(m.id, m.site_id, 'revoked', ARRAY['google_ads','meta_ads','tiktok_ads'], run, 'email_unsubscribe');

 -- 2) Dados pessoais satélite.
 DELETE FROM public.club_member_sessions WHERE member_id=m.id OR (site_id=m.site_id AND lower(btrim(email))=lower(btrim(m.email)));
 DELETE FROM public.club_wallet_passes WHERE member_id=m.id;
 DELETE FROM public.email_unsubscribe_tokens WHERE company_id=m.company_id AND lower(btrim(email))=lower(btrim(m.email));
 UPDATE public.club_member_profiles SET birth_date=NULL, birth_country=NULL, residence_country=NULL, city=NULL, updated_at=now() WHERE member_id=m.id;
 UPDATE public.club_mission_submissions SET proof_url=NULL, proof_image_path=NULL, reject_reason=NULL WHERE member_id=m.id;
 UPDATE public.club_points SET reason=NULL WHERE member_id=m.id AND rule_key<>'profile_complete' AND reason IS NOT NULL;
 UPDATE public.email_send_log SET recipient_email='sha256:'||h WHERE lower(btrim(recipient_email))=lower(btrim(m.email));

 -- 3) Supressão só por hash (e o endereço-marcador, para nenhum envio o alcançar).
 DELETE FROM public.suppressed_emails WHERE company_id=m.company_id AND email=lower(btrim(m.email));
 INSERT INTO public.suppressed_emails(email, reason, company_id) VALUES ('sha256:'||h, p_reason, m.company_id), (ph, p_reason, m.company_id)
  ON CONFLICT (email, company_id) DO UPDATE SET reason=EXCLUDED.reason;

 -- 4) Registo mínimo do membro.
 UPDATE public.club_members SET email=ph, phone=NULL, first_name=NULL, instagram_handle=NULL, tiktok_handle=NULL,
  pending_crew_code=NULL, pending_crew_status=NULL, contact_id=NULL, erased_at=now(), updated_at=now() WHERE id=m.id;
 IF m.contact_id IS NOT NULL AND other_members = 0 THEN DELETE FROM public.contacts WHERE id=m.contact_id; END IF;

 INSERT INTO public.club_retention_log(run_id, old_member_id, email_sha256, reason, tables_affected) VALUES (run, m.id, h, p_reason, cnt);
 RETURN jsonb_build_object('status','erased','run_id',run,'email_sha256',h,'tables_affected',cnt);
END $$;
REVOKE ALL ON FUNCTION public.club_member_erase(uuid, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_member_erase(uuid, text, boolean, uuid) TO service_role;
