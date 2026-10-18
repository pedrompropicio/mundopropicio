WITH desired AS (
 SELECT c.id,c.company_id,c.phone_e164,c.consent_whatsapp,w.* FROM public.contacts c
 CROSS JOIN LATERAL (SELECT w.decision,m.phone,w.phone_fp FROM public.club_members m
 JOIN public.club_member_whatsapp_consents w ON w.member_id=m.id AND w.site_id=m.site_id AND w.company_id=m.company_id
 WHERE m.contact_id=c.id AND m.company_id=c.company_id AND w.version='whatsapp-v1' ORDER BY w.id DESC LIMIT 1) w
 WHERE c.company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
), verified AS (
 -- Official SELECT cannot execute the private helper; replicate its HMAC without returning key or fingerprint.
 SELECT d.*,phone_fp=encode(extensions.hmac(convert_to(phone,'UTF8'),
 convert_to((SELECT value FROM public.app_secrets WHERE name='club_whatsapp_hmac_key'),'UTF8'),'sha256'),'hex') fp_ok FROM desired d
), classified AS (
 SELECT id,CASE
 WHEN decision<>'granted' THEN 'revoked'
 WHEN NOT consent_whatsapp THEN 'crm_consent_inactive'
 WHEN phone IS NULL OR phone !~ '^\+[1-9][0-9]{7,14}$' THEN 'invalid_member_phone'
 WHEN fp_ok IS NOT TRUE THEN 'fingerprint_mismatch'
 WHEN nullif(phone_e164,'') IS NOT NULL AND phone_e164 IS DISTINCT FROM phone THEN 'contact_phone_conflict'
 WHEN EXISTS(SELECT 1 FROM public.contacts other WHERE other.company_id=d.company_id AND other.id<>d.id AND other.phone_e164=d.phone) THEN 'phone_owned_by_other_contact'
 WHEN nullif(phone_e164,'') IS NULL THEN 'to_copy'
 ELSE 'eligible_equal' END AS reason FROM verified d
)
SELECT reason,count(*) contacts FROM classified GROUP BY reason ORDER BY reason;