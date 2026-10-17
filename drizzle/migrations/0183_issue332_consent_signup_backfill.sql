-- #332 — alargar origin/version, trigger signup e backfill dos 46 membros Newgang
ALTER TABLE public.club_member_email_consents DROP CONSTRAINT club_member_email_consents_version_check;
ALTER TABLE public.club_member_email_consents ADD CONSTRAINT club_member_email_consents_version_check
 CHECK (version IN ('email-v3','clube-newgang-v2','legacy-sem-versao'));
ALTER TABLE public.club_member_email_consents DROP CONSTRAINT club_member_email_consents_origin_check;
ALTER TABLE public.club_member_email_consents ADD CONSTRAINT club_member_email_consents_origin_check
 CHECK (origin IN ('club_session','email_unsubscribe','signup','legacy_migration'));

-- Trigger: inscrição Clube Newgang com consent_email=true e consent_text_version='email-v3'
-- grava linha {granted,email-v3,signup,decided_at=NEW.created_at,idempotency_key estável(lc.id)}.
-- Nome propositadamente ordenado DEPOIS de trg_club_from_lead_capture para o membro já existir.
CREATE OR REPLACE FUNCTION public._club332_consent_from_lead_capture() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_catalog AS $$
DECLARE s_id uuid; s_co uuid; mid uuid; v_email text; v_version text; v_key uuid;
BEGIN
  IF NEW.source IS DISTINCT FROM 'clube_newgang' OR NEW.email IS NULL THEN RETURN NEW; END IF;
  IF coalesce(NEW.consent_email,false) <> true THEN RETURN NEW; END IF;
  v_version := NEW.raw->>'consent_text_version';
  IF v_version IS DISTINCT FROM 'email-v3' THEN RETURN NEW; END IF;
  SELECT id, company_id INTO s_id, s_co FROM public.portal_sites
   WHERE brand_key='newgang' AND active AND company_id=NEW.company_id ORDER BY created_at LIMIT 1;
  IF s_id IS NULL THEN RETURN NEW; END IF;
  v_email := lower(btrim(NEW.email));
  IF EXISTS(SELECT 1 FROM public.suppressed_emails WHERE company_id=s_co AND email=v_email) THEN RETURN NEW; END IF;
  SELECT id INTO mid FROM public.club_members WHERE site_id=s_id AND lower(btrim(email))=v_email LIMIT 1;
  IF mid IS NULL THEN RETURN NEW; END IF;
  v_key := regexp_replace(md5('lc332:'||NEW.id::text),'(.{8})(.{4})(.{4})(.{4})(.{12})','\1-\2-\3-\4-\5')::uuid;
  BEGIN
    INSERT INTO public.club_member_email_consents(member_id,site_id,company_id,version,decision,decided_at,origin,idempotency_key)
    VALUES(mid,s_id,s_co,'email-v3','granted',NEW.created_at,'signup',v_key);
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '_club332_consent_from_lead_capture: %', SQLERRM; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._club332_consent_from_lead_capture() FROM PUBLIC, anon, authenticated;

-- Nome ordenado alfabeticamente DEPOIS de "trg_club_from_lead_capture" para garantir
-- que o membro já foi criado pelo trigger existente antes de tentarmos gravar o consentimento.
CREATE TRIGGER trg_club_zzz_consent_from_lead_capture
 AFTER UPDATE OF processed ON public.lead_capture
 FOR EACH ROW WHEN (NEW.processed = true AND (OLD.processed IS DISTINCT FROM NEW.processed))
 EXECUTE FUNCTION public._club332_consent_from_lead_capture();

-- Backfill: membros do site newgangfestival.pt cuja captura mais recente é consent_email=true,
-- não suprimidos e sem linha prévia. Versão/origem derivadas; idempotency_key estável por captura.
WITH ng AS (
 SELECT id AS site_id, company_id FROM public.portal_sites
  WHERE brand_key='newgang' AND active AND domain='newgangfestival.pt' LIMIT 1
), latest AS (
 SELECT DISTINCT ON (lower(btrim(lc.email)))
   lc.id, lower(btrim(lc.email)) AS norm_email, lc.created_at, lc.consent_email, lc.raw->>'consent_text_version' AS v
 FROM public.lead_capture lc JOIN ng ON lc.company_id=ng.company_id
 WHERE lc.source='clube_newgang' AND lc.email IS NOT NULL
 ORDER BY lower(btrim(lc.email)), lc.created_at DESC, lc.id DESC
), elig AS (
 SELECT cm.id AS member_id, ng.site_id, ng.company_id, l.id AS lc_id, l.created_at, l.v
 FROM latest l CROSS JOIN ng
 JOIN public.club_members cm ON cm.site_id=ng.site_id AND lower(btrim(cm.email))=l.norm_email
 WHERE l.consent_email=true
   AND NOT EXISTS(SELECT 1 FROM public.suppressed_emails s WHERE s.company_id=ng.company_id AND s.email=l.norm_email)
   AND NOT EXISTS(SELECT 1 FROM public.club_member_email_consents c WHERE c.member_id=cm.id AND c.site_id=ng.site_id)
)
INSERT INTO public.club_member_email_consents(member_id,site_id,company_id,version,decision,decided_at,origin,idempotency_key)
SELECT member_id, site_id, company_id,
 CASE WHEN v='email-v3' THEN 'email-v3' WHEN v='clube-newgang-v2' THEN 'clube-newgang-v2' ELSE 'legacy-sem-versao' END,
 'granted', created_at,
 CASE WHEN v='email-v3' THEN 'signup' ELSE 'legacy_migration' END,
 regexp_replace(md5('lc332:'||lc_id::text),'(.{8})(.{4})(.{4})(.{4})(.{12})','\1-\2-\3-\4-\5')::uuid
FROM elig;

COMMENT ON FUNCTION public._club332_consent_from_lead_capture() IS
 '#332: inscrição Clube Newgang com consent_email=true e versão email-v3 grava linha signup; versões legadas só por backfill.';
