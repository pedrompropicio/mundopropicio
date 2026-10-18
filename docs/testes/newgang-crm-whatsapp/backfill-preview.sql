WITH desired AS (
 SELECT c.*,w.decision,w.decided_at FROM public.contacts c
 CROSS JOIN LATERAL public._crm_whatsapp_latest(c.id,c.company_id) w
 WHERE c.company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
)
SELECT 'club_profile_whatsapp-v1' AS origin,count(*) AS contacts,
 count(*) FILTER(WHERE NOT consent_whatsapp AND decision='granted') AS false_to_true,
 count(*) FILTER(WHERE consent_whatsapp AND decision='revoked') AS true_to_false,
 count(*) FILTER(WHERE (consent_whatsapp,consent_whatsapp_at,consent_whatsapp_source)
 IS DISTINCT FROM (decision='granted',CASE WHEN decision='granted' THEN decided_at END,'club_profile_whatsapp-v1'::text)) AS changes
FROM desired;
