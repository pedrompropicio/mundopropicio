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
 IF NOT FOUND OR NOT c.consent_whatsapp OR c.phone_e164 IS NULL OR c.phone_e164 !~ '^\+[1-9][0-9]{7,14}$' THEN RETURN false; END IF;
 SELECT * INTO latest FROM public._crm_whatsapp_latest(c.id,c.company_id);
 IF FOUND THEN RETURN coalesce(latest.decision='granted' AND latest.phone=c.phone_e164
 AND latest.phone_fp=public._club332_whatsapp_fp(c.phone_e164),false); END IF;
 -- Pre-existing legacy true is preserved; explicit revocation above always prevails.
 IF c.consent_whatsapp_source='form_legacy_sem_prova' AND c.company_id='7d831e59-6e82-427b-95a0-64904aae5dd2'::uuid THEN RETURN false; END IF;
 RETURN coalesce(c.consent_whatsapp_source NOT IN ('club_profile_whatsapp-v1','club_profile_whatsapp-v2'),true);
END $function$;
