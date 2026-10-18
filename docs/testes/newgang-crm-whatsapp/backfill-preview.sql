WITH desired AS (
 SELECT c.*,w.decision,w.decided_at FROM public.contacts c
 CROSS JOIN LATERAL (SELECT w.decision,w.decided_at FROM public.club_members m JOIN public.club_member_whatsapp_consents w ON w.member_id=m.id AND w.site_id=m.site_id AND w.company_id=m.company_id WHERE m.contact_id=c.id AND m.company_id=c.company_id AND w.version='whatsapp-v1' ORDER BY w.id DESC LIMIT 1) w
 WHERE c.company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
)
SELECT 'club_profile_whatsapp-v1' AS origin,count(*) AS contacts,
 count(*) FILTER(WHERE NOT consent_whatsapp AND decision='granted') AS false_to_true,
 count(*) FILTER(WHERE consent_whatsapp AND decision='revoked') AS true_to_false,
 count(*) FILTER(WHERE (consent_whatsapp,consent_whatsapp_at,consent_whatsapp_source)
 IS DISTINCT FROM (decision='granted',CASE WHEN decision='granted' THEN decided_at END,'club_profile_whatsapp-v1'::text)) AS changes
FROM desired;
