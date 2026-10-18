-- Only the consent projection changes; canonical fingerprint, eligibility and ACL stay intact.
DO $$ BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public._crm_whatsapp_project()'::regprocedure) <> '03a8a105996a6bf2262ce215878871c2'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public._crm_whatsapp_latest(uuid,uuid)'::regprocedure) <> 'bf708b279b2f86a4505ecf4f8aa9d787'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public._club332_whatsapp_fp(text)'::regprocedure) <> 'd46a26619e6d80f64614cb4432004899'
 THEN RAISE EXCEPTION 'source_drift'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public._crm_whatsapp_project() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE contact uuid; latest record;
BEGIN
 IF TG_TABLE_NAME='club_members' THEN
  contact:=NEW.contact_id;
 ELSE
  SELECT m.contact_id INTO contact FROM public.club_members m
  WHERE m.id=NEW.member_id AND m.site_id=NEW.site_id AND m.company_id=NEW.company_id;
 END IF;
 IF contact IS NULL THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.contacts WHERE id=contact AND company_id=NEW.company_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT * INTO latest FROM public._crm_whatsapp_latest(contact,NEW.company_id);
 IF NOT FOUND THEN RETURN NEW; END IF;
 UPDATE public.contacts SET consent_whatsapp=latest.decision='granted',
 consent_whatsapp_at=CASE WHEN latest.decision='granted' THEN latest.decided_at END,
 consent_whatsapp_source='club_profile_whatsapp-v1'
 WHERE id=contact AND company_id=NEW.company_id AND
 (consent_whatsapp,consent_whatsapp_at,consent_whatsapp_source) IS DISTINCT FROM
 (latest.decision='granted',CASE WHEN latest.decision='granted' THEN latest.decided_at END,'club_profile_whatsapp-v1'::text);
 IF latest.decision='granted' AND latest.phone ~ '^\+[1-9][0-9]{7,14}$'
 AND latest.phone_fp=public._club332_whatsapp_fp(latest.phone) THEN
  -- A phone already owned by another contact must not abort a member's consent decision.
  BEGIN
   UPDATE public.contacts SET phone_e164=latest.phone
   WHERE id=contact AND company_id=NEW.company_id AND nullif(phone_e164,'') IS NULL
   AND NOT EXISTS(SELECT 1 FROM public.contacts other WHERE other.company_id=NEW.company_id
    AND other.id<>contact AND other.phone_e164=latest.phone);
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_whatsapp_member_phone_project AFTER UPDATE OF phone ON public.club_members
 FOR EACH ROW WHEN (OLD.phone IS DISTINCT FROM NEW.phone)
 EXECUTE FUNCTION public._crm_whatsapp_project();