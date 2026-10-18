-- INERTE: only execute after Pedro approves the fresh preview with "Sim".
-- Contacts locked first; latest ledger decision resolved per contact/company by server id.
BEGIN;
SELECT c.id FROM public.contacts c WHERE c.company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
 AND EXISTS(SELECT 1 FROM public.club_members m JOIN public.club_member_whatsapp_consents w ON w.member_id=m.id AND w.site_id=m.site_id AND w.company_id=m.company_id WHERE m.contact_id=c.id AND m.company_id=c.company_id) ORDER BY c.id FOR UPDATE;
WITH desired AS (
 SELECT c.id,w.decision,w.decided_at FROM public.contacts c
 CROSS JOIN LATERAL (SELECT w.decision,w.decided_at FROM public.club_members m JOIN public.club_member_whatsapp_consents w ON w.member_id=m.id AND w.site_id=m.site_id AND w.company_id=m.company_id WHERE m.contact_id=c.id AND m.company_id=c.company_id AND w.version='whatsapp-v1' ORDER BY w.id DESC LIMIT 1) w
 WHERE c.company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
)
UPDATE public.contacts c SET consent_whatsapp=d.decision='granted',
 consent_whatsapp_at=CASE WHEN d.decision='granted' THEN d.decided_at END,
 consent_whatsapp_source='club_profile_whatsapp-v1'
FROM desired d WHERE c.id=d.id AND (c.consent_whatsapp,c.consent_whatsapp_at,c.consent_whatsapp_source)
 IS DISTINCT FROM (d.decision='granted',CASE WHEN d.decision='granted' THEN d.decided_at END,'club_profile_whatsapp-v1'::text);
COMMIT;
