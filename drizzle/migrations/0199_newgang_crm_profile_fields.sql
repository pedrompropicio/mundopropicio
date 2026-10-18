-- CRM Newgang: profile-first fields in list/summary + separate IP-estimated city (CRM read-only).
DO $$ BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.clube_newgang_list(text,int,int)'::regprocedure) <> '55fe80bc1370d07e2ba3de9bf2a25653'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.clube_newgang_summary()'::regprocedure) <> '3caeb989eb4b348326ddd0aac199730f'
 THEN RAISE EXCEPTION 'source_drift'; END IF;
END $$;
CREATE TEMP TABLE _ng199_acl ON COMMIT DROP AS SELECT proacl,proowner FROM pg_proc WHERE oid='public.clube_newgang_list(text,int,int)'::regprocedure;
DROP FUNCTION public.clube_newgang_list(text,int,int);
CREATE FUNCTION public.clube_newgang_list(p_search text DEFAULT NULL,p_limit int DEFAULT 50,p_offset int DEFAULT 0,p_profile_complete boolean DEFAULT NULL)
RETURNS TABLE(id uuid,name text,email text,phone text,birth_date text,city text,postal_code text,
 consent_email boolean,consent_whatsapp boolean,utm_source text,utm_medium text,utm_campaign text,
 created_at timestamptz,total_count bigint,submissions bigint,member_no integer,confirmed_at timestamptz,
 consent_whatsapp_source text,whatsapp_eligible boolean,
 birth_country text,residence_country text,city_source text,profile_complete boolean,profile_completed_at timestamptz,
 estimated_city text,estimated_region text,estimated_country text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 PERFORM public._clube_newgang_assert_access(); RETURN QUERY
 WITH ranked AS (
 SELECT l.*,lower(btrim(l.email)) AS normalized_email,
 count(*) OVER(PARTITION BY lower(btrim(l.email))) AS submitted,
 row_number() OVER(PARTITION BY lower(btrim(l.email)) ORDER BY l.created_at,l.id) AS rn
 FROM public.lead_capture l WHERE l.source='clube_newgang' AND public.row_belongs_to_current_company(l.company_id)
 AND l.email IS NOT NULL
 ), people AS (SELECT * FROM ranked WHERE rn=1),
 geo AS (SELECT DISTINCT ON (r.normalized_email) r.normalized_email,nullif(btrim(r.geo_city),'') AS gc,nullif(btrim(r.geo_region),'') AS gr,nullif(btrim(r.geo_country),'') AS gco
 FROM ranked r WHERE nullif(btrim(r.geo_city),'') IS NOT NULL ORDER BY r.normalized_email,r.created_at,r.id),
 joined AS (
 SELECT l.*,m.phone AS m_phone,m.member_no AS m_no,m.confirmed_at AS m_confirmed,m.contact_id AS m_contact,
 p.birth_date AS p_birth,nullif(btrim(p.birth_country),'') AS p_bc,nullif(btrim(p.residence_country),'') AS p_rc,nullif(btrim(p.city),'') AS p_city,p.completed_at AS p_done,
 g.gc,g.gr,g.gco
 FROM people l LEFT JOIN LATERAL (
 SELECT cm.* FROM public.club_members cm JOIN public.portal_sites ps ON ps.id=cm.site_id AND ps.company_id=cm.company_id AND ps.brand_key='newgang'
 WHERE cm.company_id=l.company_id AND lower(btrim(cm.email))=l.normalized_email ORDER BY cm.created_at,cm.id LIMIT 1
 ) m ON true
 LEFT JOIN public.club_member_profiles p ON p.member_id=m.id AND p.company_id=m.company_id AND p.site_id=m.site_id
 LEFT JOIN geo g ON g.normalized_email=l.normalized_email
 WHERE (coalesce(btrim(p_search),'')='' OR l.name ILIKE '%'||btrim(p_search)||'%' OR l.normalized_email ILIKE '%'||btrim(p_search)||'%')
 AND (p_profile_complete IS NULL OR (p.completed_at IS NOT NULL)=p_profile_complete)
 )
 SELECT j.id,j.name,j.normalized_email,coalesce(j.m_phone,j.phone),
 coalesce(j.p_birth::text,nullif(btrim(j.raw->>'birth_date'),'')),
 CASE WHEN j.p_city IS NOT NULL THEN public.club_city_display(coalesce(j.p_rc,j.raw->>'residence_country'),j.p_city)
 ELSE public.club_city_display(coalesce(j.p_rc,j.raw->>'residence_country'),j.raw->>'city') END,
 j.raw->>'postal_code',j.consent_email,
 coalesce(c.consent_whatsapp,j.consent_whatsapp),j.utm_source,j.utm_medium,j.utm_campaign,j.created_at,
 count(*) OVER(),j.submitted,j.m_no,j.m_confirmed,
 coalesce(c.consent_whatsapp_source,CASE WHEN coalesce(c.consent_whatsapp,j.consent_whatsapp) THEN 'form_legacy_sem_prova' END),
 coalesce(public.crm_whatsapp_eligible(c.id),false),
 upper(coalesce(j.p_bc,nullif(btrim(j.raw->>'birth_country'),''))),
 upper(coalesce(j.p_rc,nullif(btrim(j.raw->>'residence_country'),''))),
 CASE WHEN j.p_city IS NOT NULL THEN 'perfil' WHEN nullif(btrim(j.raw->>'city'),'') IS NOT NULL THEN 'formulario' END,
 j.p_done IS NOT NULL,j.p_done,
 j.gc,j.gr,upper(j.gco)
 FROM joined j LEFT JOIN public.contacts c ON c.id=j.m_contact AND c.company_id=j.company_id
 ORDER BY j.created_at DESC,j.id LIMIT least(greatest(coalesce(p_limit,50),1),1000) OFFSET greatest(coalesce(p_offset,0),0);
END $$;
DO $$ DECLARE a record; role_name text; BEGIN
 EXECUTE format('ALTER FUNCTION public.clube_newgang_list(text,int,int,boolean) OWNER TO %I',(SELECT pg_get_userbyid(proowner) FROM _ng199_acl));
 FOR a IN SELECT DISTINCT grantee FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid='public.clube_newgang_list(text,int,int,boolean)'::regprocedure)) LOOP
 role_name:=CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END;
 EXECUTE 'REVOKE ALL ON FUNCTION public.clube_newgang_list(text,int,int,boolean) FROM '||role_name;
 END LOOP;
 FOR a IN SELECT * FROM aclexplode((SELECT proacl FROM _ng199_acl)) LOOP
 role_name:=CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END;
 EXECUTE 'GRANT EXECUTE ON FUNCTION public.clube_newgang_list(text,int,int,boolean) TO '||role_name||CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END;
 END LOOP;
END $$;
COMMENT ON FUNCTION public.clube_newgang_list(text,int,int,boolean) IS 'CRM Newgang: one row per normalized email. Declared fields read club_member_profiles first, lead_capture.raw (first capture) only when profile/field is empty. estimated_* = geo_* of the first capture with a value, CRM read-only, never overwrites declared city and never used in audiences/exports to ads platforms.';
CREATE OR REPLACE FUNCTION public.clube_newgang_summary()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v jsonb; v_today date:=(now() AT TIME ZONE 'Europe/Lisbon')::date; BEGIN
 PERFORM public._clube_newgang_assert_access();
 WITH first_capture AS (SELECT DISTINCT ON (lower(btrim(email))) * FROM public.lead_capture WHERE source='clube_newgang' AND public.row_belongs_to_current_company(company_id) AND email IS NOT NULL ORDER BY lower(btrim(email)),created_at,id),
 fp AS (SELECT f.*,p.birth_date AS p_birth,nullif(btrim(p.residence_country),'') AS p_rc,nullif(btrim(p.city),'') AS p_city FROM first_capture f LEFT JOIN LATERAL (
 SELECT cm.* FROM public.club_members cm JOIN public.portal_sites ps ON ps.id=cm.site_id AND ps.company_id=cm.company_id AND ps.brand_key='newgang'
 WHERE cm.company_id=f.company_id AND lower(btrim(cm.email))=lower(btrim(f.email)) ORDER BY cm.created_at,cm.id LIMIT 1) m ON true
 LEFT JOIN public.club_member_profiles p ON p.member_id=m.id AND p.company_id=m.company_id AND p.site_id=m.site_id),
 b AS (SELECT (created_at AT TIME ZONE 'Europe/Lisbon')::date AS d,public.club_city_display(coalesce(p_rc,raw->>'residence_country'),coalesce(p_city,raw->>'city')) AS city,coalesce(nullif(utm_source,''),'(direto)')||' / '||coalesce(nullif(utm_medium,''),'—')||' / '||coalesce(nullif(utm_campaign,''),'—') AS utm,coalesce(p_birth,public._clube_newgang_birth(raw)) AS bd FROM fp),a AS (SELECT *,CASE WHEN bd IS NULL THEN 'sem data' ELSE CASE WHEN extract(year FROM age(v_today,bd))<18 THEN '<18' WHEN extract(year FROM age(v_today,bd))<25 THEN '18–24' WHEN extract(year FROM age(v_today,bd))<35 THEN '25–34' WHEN extract(year FROM age(v_today,bd))<45 THEN '35–44' ELSE '45+' END END AS faixa FROM b)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM a),'today',(SELECT count(*) FROM a WHERE d=v_today),'last7',(SELECT count(*) FROM a WHERE d>v_today-7),'by_day',coalesce((SELECT jsonb_agg(jsonb_build_object('d',d,'n',n) ORDER BY d) FROM (SELECT d,count(*) n FROM a GROUP BY d)x),'[]'::jsonb),'by_city',coalesce((SELECT jsonb_agg(jsonb_build_object('k',k,'n',n) ORDER BY n DESC,k) FROM (SELECT coalesce(min(city),'(sem cidade)') k,count(*) n FROM a GROUP BY public.club_city_key(city) ORDER BY 2 DESC,1 LIMIT 10)x),'[]'::jsonb),'by_utm',coalesce((SELECT jsonb_agg(jsonb_build_object('k',utm,'n',n) ORDER BY n DESC,utm) FROM (SELECT utm,count(*) n FROM a GROUP BY 1 ORDER BY 2 DESC,1 LIMIT 20)x),'[]'::jsonb),'by_age',(SELECT jsonb_agg(jsonb_build_object('k',f,'n',(SELECT count(*) FROM a WHERE faixa=f)) ORDER BY o) FROM unnest(ARRAY['<18','18–24','25–34','35–44','45+','sem data']) WITH ORDINALITY AS t(f,o))) INTO v; RETURN v;
END $function$;
COMMENT ON FUNCTION public.clube_newgang_summary() IS 'CRM Newgang: one normalized email; first capture (created_at,id) determines date and UTM; city/age read the Newgang member profile first and fall back to the first capture. Estimated (IP) city is not counted. No historical records changed.';
-- New captures: when IP was stored with consent but geo_* is empty, fill from the local DB-IP table (no external call). Fail-soft.
CREATE FUNCTION public._lead_capture_geo_local() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE r record; BEGIN
 IF NEW.ip_inet IS NOT NULL AND NEW.geo_country IS NULL AND NEW.geo_city IS NULL THEN
 BEGIN
 SELECT x.country,x.region,x.city,x.ip_to INTO r FROM public.ip_city_ranges x WHERE x.ip_from<=NEW.ip_inet ORDER BY x.ip_from DESC,x.source_month DESC LIMIT 1;
 IF FOUND AND r.ip_to>=NEW.ip_inet AND family(r.ip_to)=family(NEW.ip_inet) THEN
 NEW.geo_country:=nullif(btrim(r.country),''); NEW.geo_region:=nullif(btrim(r.region),''); NEW.geo_city:=nullif(btrim(r.city),'');
 END IF;
 EXCEPTION WHEN OTHERS THEN NULL; END;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._lead_capture_geo_local() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER lead_capture_geo_local BEFORE INSERT ON public.lead_capture FOR EACH ROW EXECUTE FUNCTION public._lead_capture_geo_local();
