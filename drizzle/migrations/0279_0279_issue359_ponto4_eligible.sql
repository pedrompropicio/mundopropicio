-- #359 ponto 4 — RASCUNHO R1, NÃO APLICAR. Depende de A.
-- Baseline Live pg_get_functiondef md5 dd895c8448e0b5cb0e83c2dbd9554dac.
-- Só novo ramo Coala antes das verificações 0276; sufixo antigo byte-idêntico.
CREATE OR REPLACE FUNCTION public.crm_whatsapp_eligible(p_contact uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c public.contacts; latest record;
BEGIN
 SELECT * INTO c FROM public.contacts WHERE id=p_contact AND
  (public.row_belongs_to_current_company(company_id) OR auth.role()='service_role');
 IF NOT FOUND THEN RETURN false; END IF;
 IF c.company_id='7d831e59-6e82-427b-95a0-64904aae5dd2'::uuid THEN
   SELECT * INTO latest FROM public.coala_person_consents
   WHERE company_id=c.company_id AND email=lower(btrim(c.email)) AND channel='whatsapp' ORDER BY id DESC LIMIT 1;
   IF FOUND THEN
     RETURN coalesce(latest.decision='granted' AND c.phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
       AND latest.phone=c.phone_e164 AND latest.phone_fp=encode(sha256(convert_to(c.phone_e164,'UTF8')),'hex'),false);
   END IF;
 END IF;
 PERFORM 1; -- restaura FOUND do contacto para o fallback0276 sem decisão Coala
 IF NOT FOUND OR NOT c.consent_whatsapp OR c.phone_e164 IS NULL OR c.phone_e164 !~ '^\+[1-9][0-9]{7,14}$' THEN RETURN false; END IF;
 SELECT * INTO latest FROM public._crm_whatsapp_latest(c.id,c.company_id);
 IF FOUND THEN RETURN coalesce(latest.decision='granted' AND latest.phone=c.phone_e164
 AND latest.phone_fp=public._club332_whatsapp_fp(c.phone_e164),false); END IF;
 -- Pre-existing legacy true is preserved; explicit revocation above always prevails.
 IF c.consent_whatsapp_source='form_legacy_sem_prova' AND c.company_id='7d831e59-6e82-427b-95a0-64904aae5dd2'::uuid THEN RETURN false; END IF;
 RETURN coalesce(c.consent_whatsapp_source NOT IN ('club_profile_whatsapp-v1','club_profile_whatsapp-v2'),true);
END $function$;
