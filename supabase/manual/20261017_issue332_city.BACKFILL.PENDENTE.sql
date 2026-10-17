-- FASE A: DO NOT RUN. Re-read preview and obtain Pedro's explicit approval.
-- Exact municipality matches only; no fuzzy/locality mapping; no invented country.
BEGIN;
UPDATE public.lead_capture lc SET raw=jsonb_set(lc.raw,'{city}',to_jsonb(pm.name))
FROM (SELECT public.club_city_key(name) AS k,min(name) AS name FROM public.portugal_municipalities GROUP BY 1) pm
WHERE lc.company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c' AND lc.source='clube_newgang'
 AND upper(coalesce(nullif(btrim(lc.raw->>'residence_country'),''),'PT')) IN ('PT','PORTUGAL')
 AND public.club_city_key(lc.raw->>'city')=pm.k AND lc.raw->>'city' IS DISTINCT FROM pm.name;
UPDATE public.club_member_profiles p SET city=pm.name
FROM public.portal_sites s,(SELECT public.club_city_key(name) AS k,min(name) AS name FROM public.portugal_municipalities GROUP BY 1) pm
WHERE p.site_id=s.id AND s.domain='newgangfestival.pt' AND s.company_id=p.company_id
 AND p.residence_country='PT' AND public.club_city_key(p.city)=pm.k AND p.city IS DISTINCT FROM pm.name;
COMMIT;
