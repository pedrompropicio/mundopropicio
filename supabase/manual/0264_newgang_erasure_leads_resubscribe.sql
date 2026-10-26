-- R2 #368 fase 2 (plano aprovado 26/10). NÃO aplicado: aguarda "Sim" do Pedro.
-- (1) Apagamento a pedido passa a anonimizar leads de todos os módulos com o mesmo email
--     (predicado: lower(btrim(email)) = email normalizado do membro, e company_id do membro).
-- (2) Reinscrição com consentimento novo (email-v3, granted, origin signup) limpa só a supressão
--     sha256:<hash> com reason erasure_request; regista 'resubscribe_clear' sem PII.
-- Mesma assinatura, SECURITY DEFINER, search_path fixo, só service_role, dry_run por omissão.

ALTER TABLE public.club_retention_log DROP CONSTRAINT IF EXISTS club_retention_log_reason_check;
ALTER TABLE public.club_retention_log ADD CONSTRAINT club_retention_log_reason_check
  CHECK (reason IN ('erasure_request','retention_36m','resubscribe_clear'));

CREATE OR REPLACE FUNCTION public.club_member_erase(p_member_id uuid, p_reason text DEFAULT 'erasure_request', p_dry_run boolean DEFAULT true, p_run_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m public.club_members; h text; ph text; e text; run uuid := coalesce(p_run_id, gen_random_uuid());
 cnt jsonb := '{}'::jsonb; other_members int;
 pii_keys text[] := ARRAY['email','name','first_name','last_name','phone','phone_e164','instagram','instagram_handle','tiktok','tiktok_handle','birth_date'];
BEGIN
 IF p_reason IS NULL OR p_reason NOT IN ('erasure_request','retention_36m') THEN RAISE EXCEPTION 'erase_reason'; END IF;
 SELECT * INTO m FROM public.club_members WHERE id = p_member_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','not_member'); END IF;
 PERFORM public._club_site_lock(m.site_id, false);
 SELECT * INTO m FROM public.club_members WHERE id = p_member_id FOR UPDATE;
 IF m.erased_at IS NOT NULL THEN RETURN jsonb_build_object('status','already_erased','erased_at',m.erased_at); END IF;
 e := lower(btrim(m.email));
 h := encode(sha256(convert_to(e,'UTF8')),'hex');
 ph := 'erased+' || m.id::text || '@invalid';
 SELECT count(*) INTO other_members FROM public.club_members WHERE contact_id = m.contact_id AND id <> m.id;

 cnt := jsonb_build_object(
  'club_members', 1,
  'contacts', CASE WHEN m.contact_id IS NOT NULL AND other_members = 0 AND EXISTS(SELECT 1 FROM public.contacts WHERE id=m.contact_id) THEN 1 ELSE 0 END,
  'contacts_anonymized', (SELECT count(*) FROM public.contacts WHERE company_id=m.company_id AND lower(btrim(email))=e AND id IS DISTINCT FROM m.contact_id),
  'leads_anonymized', (SELECT count(*) FROM public.leads l JOIN public.contacts c ON c.id=l.contact_id WHERE c.company_id=m.company_id AND lower(btrim(c.email))=e),
  'lead_capture', (SELECT count(*) FROM public.lead_capture WHERE company_id=m.company_id AND lower(btrim(email))=e),
  'coala_invites', (SELECT count(*) FROM public.coala_invites WHERE company_id=m.company_id AND lower(btrim(email))=e),
  'coala_list_consents', (SELECT count(*) FROM public.coala_list_consents WHERE company_id=m.company_id AND lower(btrim(email))=e),
  'fever_buyers', (SELECT count(*) FROM public.fever_buyers WHERE company_id=m.company_id AND lower(btrim(email))=e),
  'meta_audience_upload_members', (SELECT count(*) FROM public.meta_audience_upload_members WHERE company_id=m.company_id AND lower(btrim(email))=e),
  'vip_coupon_email_log', (SELECT count(*) FROM public.vip_coupon_email_log WHERE lower(btrim(email))=e),
  'club_member_sessions', (SELECT count(*) FROM public.club_member_sessions WHERE member_id=m.id OR (site_id=m.site_id AND lower(btrim(email))=e)),
  'club_wallet_passes', (SELECT count(*) FROM public.club_wallet_passes WHERE member_id=m.id),
  'club_member_profiles', (SELECT count(*) FROM public.club_member_profiles WHERE member_id=m.id),
  'club_mission_submissions', (SELECT count(*) FROM public.club_mission_submissions WHERE member_id=m.id),
  'club_points', (SELECT count(*) FROM public.club_points WHERE member_id=m.id),
  'email_unsubscribe_tokens', (SELECT count(*) FROM public.email_unsubscribe_tokens WHERE company_id=m.company_id AND lower(btrim(email))=e),
  'email_send_log', (SELECT count(*) FROM public.email_send_log WHERE lower(btrim(recipient_email))=e),
  'suppressed_emails_plain_removed', (SELECT count(*) FROM public.suppressed_emails WHERE company_id=m.company_id AND email=e),
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

 -- 2) Dados pessoais satélite do Clube.
 DELETE FROM public.club_member_sessions WHERE member_id=m.id OR (site_id=m.site_id AND lower(btrim(email))=e);
 DELETE FROM public.club_wallet_passes WHERE member_id=m.id;
 DELETE FROM public.email_unsubscribe_tokens WHERE company_id=m.company_id AND lower(btrim(email))=e;
 UPDATE public.club_member_profiles SET birth_date=NULL, birth_country=NULL, residence_country=NULL, city=NULL, updated_at=now() WHERE member_id=m.id;
 UPDATE public.club_mission_submissions SET proof_url=NULL, proof_image_path=NULL, reject_reason=NULL WHERE member_id=m.id;
 UPDATE public.club_points SET reason=NULL WHERE member_id=m.id AND rule_key<>'profile_complete' AND reason IS NOT NULL;
 UPDATE public.email_send_log SET recipient_email='sha256:'||h WHERE lower(btrim(recipient_email))=e;

 -- 3) Leads de todos os módulos: registo mantido (agregados), PII a NULL.
 --    lead_capture: não toca em processed nem em raw->city/residence_country (nenhum trigger de ingestão/envio dispara).
 UPDATE public.leads l SET ip_inet=NULL, user_agent=NULL, meta=NULL
   FROM public.contacts c WHERE c.id=l.contact_id AND c.company_id=m.company_id AND lower(btrim(c.email))=e;
 UPDATE public.lead_capture SET email=NULL, name=NULL, phone=NULL, ip_inet=NULL, user_agent=NULL,
   raw = CASE WHEN raw IS NULL THEN NULL ELSE raw - pii_keys END
   WHERE company_id=m.company_id AND lower(btrim(email))=e;
 UPDATE public.coala_invites SET email=ph, confirm_url=NULL WHERE company_id=m.company_id AND lower(btrim(email))=e;
 UPDATE public.coala_list_consents SET email=ph WHERE company_id=m.company_id AND lower(btrim(email))=e;
 UPDATE public.fever_buyers SET email=NULL, first_name=NULL, last_name=NULL WHERE company_id=m.company_id AND lower(btrim(email))=e;
 UPDATE public.meta_audience_upload_members SET email=NULL, phone_e164=NULL WHERE company_id=m.company_id AND lower(btrim(email))=e;
 UPDATE public.vip_coupon_email_log SET email=ph WHERE lower(btrim(email))=e;
 UPDATE public.contacts SET email=NULL, phone_e164=NULL, name=NULL, email_hash_sha256=NULL, phone_hash_sha256=NULL,
   consent_email=false, consent_whatsapp=false, is_active=false, updated_at=now()
   WHERE company_id=m.company_id AND lower(btrim(email))=e AND id IS DISTINCT FROM m.contact_id;

 -- 4) Supressão só por hash (e o endereço-marcador, para nenhum envio o alcançar).
 DELETE FROM public.suppressed_emails WHERE company_id=m.company_id AND email=e;
 INSERT INTO public.suppressed_emails(email, reason, company_id) VALUES ('sha256:'||h, p_reason, m.company_id), (ph, p_reason, m.company_id)
  ON CONFLICT (email, company_id) DO UPDATE SET reason=EXCLUDED.reason;

 -- 5) Registo mínimo do membro.
 UPDATE public.club_members SET email=ph, phone=NULL, first_name=NULL, instagram_handle=NULL, tiktok_handle=NULL,
  pending_crew_code=NULL, pending_crew_status=NULL, contact_id=NULL, erased_at=now(), updated_at=now() WHERE id=m.id;
 IF m.contact_id IS NOT NULL AND other_members = 0 THEN DELETE FROM public.contacts WHERE id=m.contact_id; END IF;

 INSERT INTO public.club_retention_log(run_id, old_member_id, email_sha256, reason, tables_affected) VALUES (run, m.id, h, p_reason, cnt);
 RETURN jsonb_build_object('status','erased','run_id',run,'email_sha256',h,'tables_affected',cnt);
END $$;
REVOKE ALL ON FUNCTION public.club_member_erase(uuid, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_member_erase(uuid, text, boolean, uuid) TO service_role;

-- (2) Reinscrição: só um consentimento novo de email (granted, signup, email-v3) limpa a supressão por apagamento.
CREATE OR REPLACE FUNCTION public._club368_resubscribe_clear()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m public.club_members; h text; n int;
BEGIN
 IF NEW.decision <> 'granted' OR NEW.origin <> 'signup' OR NEW.version <> 'email-v3' THEN RETURN NULL; END IF;
 SELECT * INTO m FROM public.club_members WHERE id = NEW.member_id;
 IF NOT FOUND OR m.erased_at IS NOT NULL OR m.email IS NULL THEN RETURN NULL; END IF;
 h := encode(sha256(convert_to(lower(btrim(m.email)),'UTF8')),'hex');
 DELETE FROM public.suppressed_emails WHERE company_id = m.company_id AND email = 'sha256:'||h AND reason = 'erasure_request';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n > 0 THEN
  INSERT INTO public.club_retention_log(run_id, old_member_id, email_sha256, reason, tables_affected)
  VALUES (NEW.idempotency_key, m.id, h, 'resubscribe_clear', jsonb_build_object('suppressed_emails_hash_removed', n, 'consent_id', NEW.id));
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._club368_resubscribe_clear() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS club368_resubscribe_clear ON public.club_member_email_consents;
CREATE TRIGGER club368_resubscribe_clear AFTER INSERT ON public.club_member_email_consents
  FOR EACH ROW EXECUTE FUNCTION public._club368_resubscribe_clear();
