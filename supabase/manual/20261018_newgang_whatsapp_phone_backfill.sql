-- Authorized by Pedro 18/10/2026; preserves filled phones and legacy contacts.
BEGIN;
SELECT c.id FROM public.contacts c WHERE c.company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
 AND EXISTS(SELECT 1 FROM public.club_members m WHERE m.contact_id=c.id AND m.company_id=c.company_id)
 ORDER BY c.id FOR UPDATE;
WITH desired AS (
 SELECT c.id,c.company_id,w.* FROM public.contacts c
 CROSS JOIN LATERAL (SELECT w.decision,m.phone,w.phone_fp FROM public.club_members m
 JOIN public.club_member_whatsapp_consents w ON w.member_id=m.id AND w.site_id=m.site_id AND w.company_id=m.company_id
 WHERE m.contact_id=c.id AND m.company_id=c.company_id AND w.version='whatsapp-v1' ORDER BY w.id DESC LIMIT 1) w
 WHERE c.company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c' AND c.consent_whatsapp AND nullif(c.phone_e164,'') IS NULL
), updated AS (
 UPDATE public.contacts c SET phone_e164=d.phone FROM desired d WHERE c.id=d.id AND c.company_id=d.company_id
 AND nullif(c.phone_e164,'') IS NULL AND d.decision='granted' AND d.phone ~ '^\+[1-9][0-9]{7,14}$'
 AND d.phone_fp=encode(extensions.hmac(convert_to(d.phone,'UTF8'),convert_to((SELECT value FROM public.app_secrets WHERE name='club_whatsapp_hmac_key'),'UTF8'),'sha256'),'hex')
 AND NOT EXISTS(SELECT 1 FROM public.contacts other WHERE other.company_id=d.company_id AND other.id<>d.id AND other.phone_e164=d.phone)
 RETURNING c.id
) SELECT count(*) copied FROM updated;
COMMIT;