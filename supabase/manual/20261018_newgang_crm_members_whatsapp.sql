-- CRM Newgang: one person per normalized email; canonical WhatsApp projection.
-- Historical consent changes are deliberately NOT backfilled here.
DO $$ BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.clube_newgang_list(text,int,int)'::regprocedure) <> 'd2348d4b91a2809cecacade9da3272d5'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.clube_newgang_summary()'::regprocedure) <> '81d5ccedb0daf0f32c2000063c133fae'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.crm_filter_match(public.contacts,jsonb,jsonb)'::regprocedure) <> '1fc526da112092f70ef83b7a1ff32c37'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.crm_contacts_by_audience(uuid,text,text,text,text,text,int,int)'::regprocedure) <> '3e074cb72f333b9f4770e1554a60acdf'
 THEN RAISE EXCEPTION 'source_drift'; END IF;
END $$;
ALTER TABLE public.contacts ADD COLUMN consent_whatsapp_source text
 CHECK (consent_whatsapp_source IN ('club_profile_whatsapp-v1','form_legacy_sem_prova'));
-- Additive provenance only: never changes consent boolean/date or projects historical decisions.
UPDATE public.contacts SET consent_whatsapp_source='form_legacy_sem_prova'
 WHERE consent_whatsapp=true AND consent_whatsapp_source IS NULL;

CREATE FUNCTION public._crm_whatsapp_latest(p_contact uuid,p_company uuid)
RETURNS TABLE(decision text,decided_at timestamptz,phone text,phone_fp text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT w.decision,w.decided_at,m.phone,w.phone_fp
 FROM public.club_members m JOIN public.club_member_whatsapp_consents w
 ON w.member_id=m.id AND w.site_id=m.site_id AND w.company_id=m.company_id
 WHERE m.contact_id=p_contact AND m.company_id=p_company AND w.version='whatsapp-v1'
 ORDER BY w.id DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public._crm_whatsapp_latest(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public._crm_whatsapp_project() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE contact uuid; latest record;
BEGIN
 SELECT m.contact_id INTO contact FROM public.club_members m
 WHERE m.id=NEW.member_id AND m.site_id=NEW.site_id AND m.company_id=NEW.company_id;
 IF contact IS NULL THEN RETURN NEW; END IF;
 -- Serialize all decisions projected onto the same contact. Ledger order is server id, not client time.
 PERFORM 1 FROM public.contacts WHERE id=contact AND company_id=NEW.company_id FOR UPDATE;
 SELECT * INTO latest FROM public._crm_whatsapp_latest(contact,NEW.company_id);
 UPDATE public.contacts SET consent_whatsapp=latest.decision='granted',
 consent_whatsapp_at=CASE WHEN latest.decision='granted' THEN latest.decided_at END,
 consent_whatsapp_source='club_profile_whatsapp-v1'
 WHERE id=contact AND company_id=NEW.company_id AND
 (consent_whatsapp,consent_whatsapp_at,consent_whatsapp_source) IS DISTINCT FROM
 (latest.decision='granted',CASE WHEN latest.decision='granted' THEN latest.decided_at END,'club_profile_whatsapp-v1'::text);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._crm_whatsapp_project() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER crm_whatsapp_profile_project AFTER INSERT ON public.club_member_whatsapp_consents
 FOR EACH ROW EXECUTE FUNCTION public._crm_whatsapp_project();

CREATE FUNCTION public._crm_whatsapp_contact_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE latest record;
BEGIN
 -- Unrelated ingestion updates must not perform the unapproved historical backfill.
 IF TG_OP='UPDATE' AND (NEW.consent_whatsapp,NEW.consent_whatsapp_at,NEW.consent_whatsapp_source)
 IS NOT DISTINCT FROM (OLD.consent_whatsapp,OLD.consent_whatsapp_at,OLD.consent_whatsapp_source) THEN RETURN NEW; END IF;
 SELECT * INTO latest FROM public._crm_whatsapp_latest(NEW.id,NEW.company_id);
 IF FOUND THEN
 NEW.consent_whatsapp:=latest.decision='granted';
 NEW.consent_whatsapp_at:=CASE WHEN latest.decision='granted' THEN latest.decided_at END;
 NEW.consent_whatsapp_source:='club_profile_whatsapp-v1';
 ELSIF NEW.consent_whatsapp THEN
 NEW.consent_whatsapp_source:='form_legacy_sem_prova';
 ELSE NEW.consent_whatsapp_at:=NULL; NEW.consent_whatsapp_source:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._crm_whatsapp_contact_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER crm_whatsapp_contact_guard BEFORE INSERT OR UPDATE ON public.contacts
 FOR EACH ROW EXECUTE FUNCTION public._crm_whatsapp_contact_guard();

CREATE FUNCTION public.crm_whatsapp_eligible(p_contact uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.contacts; latest record;
BEGIN
 SELECT * INTO c FROM public.contacts WHERE id=p_contact AND
 (public.row_belongs_to_current_company(company_id) OR auth.role()='service_role');
 IF NOT FOUND OR NOT c.consent_whatsapp OR c.phone_e164 IS NULL OR c.phone_e164 !~ '^\+[1-9][0-9]{7,14}$' THEN RETURN false; END IF;
 SELECT * INTO latest FROM public._crm_whatsapp_latest(c.id,c.company_id);
 IF FOUND THEN RETURN coalesce(latest.decision='granted' AND latest.phone=c.phone_e164
 AND latest.phone_fp=public._club332_whatsapp_fp(c.phone_e164),false); END IF;
 -- Pre-existing legacy true is preserved; explicit revocation above always prevails.
 RETURN c.consent_whatsapp_source IS DISTINCT FROM 'club_profile_whatsapp-v1';
END $$;
REVOKE ALL ON FUNCTION public.crm_whatsapp_eligible(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_whatsapp_eligible(uuid) TO authenticated,service_role;
CREATE VIEW public.crm_whatsapp_eligible_contacts WITH (security_invoker=true) AS
 SELECT c.id,c.company_id,c.phone_e164 FROM public.contacts c WHERE public.crm_whatsapp_eligible(c.id);
REVOKE ALL ON public.crm_whatsapp_eligible_contacts FROM PUBLIC,anon;
GRANT SELECT ON public.crm_whatsapp_eligible_contacts TO authenticated,service_role;

-- Keep the existing ACL (including actual executor grants), not guessed defaults.
CREATE TEMP TABLE _ng_acl ON COMMIT DROP AS SELECT proowner,proacl FROM pg_proc
 WHERE oid='public.clube_newgang_list(text,int,int)'::regprocedure;
DROP FUNCTION public.clube_newgang_list(text,int,int);
CREATE FUNCTION public.clube_newgang_list(p_search text DEFAULT NULL,p_limit int DEFAULT 50,p_offset int DEFAULT 0)
RETURNS TABLE(id uuid,name text,email text,phone text,birth_date text,city text,postal_code text,
 consent_email boolean,consent_whatsapp boolean,utm_source text,utm_medium text,utm_campaign text,
 created_at timestamptz,total_count bigint,submissions bigint,member_no integer,confirmed_at timestamptz,
 consent_whatsapp_source text,whatsapp_eligible boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 PERFORM public._clube_newgang_assert_access(); RETURN QUERY
 WITH ranked AS (
 SELECT l.*,lower(btrim(l.email)) AS normalized_email,
 count(*) OVER(PARTITION BY lower(btrim(l.email))) AS submitted,
 row_number() OVER(PARTITION BY lower(btrim(l.email)) ORDER BY l.created_at,l.id) AS rn
 FROM public.lead_capture l WHERE l.source='clube_newgang' AND public.row_belongs_to_current_company(l.company_id)
 AND l.email IS NOT NULL
 ), people AS (SELECT * FROM ranked WHERE rn=1)
 SELECT l.id,l.name,l.normalized_email,coalesce(m.phone,l.phone),l.raw->>'birth_date',
 public.club_city_display(l.raw->>'residence_country',l.raw->>'city'),l.raw->>'postal_code',l.consent_email,
 coalesce(c.consent_whatsapp,l.consent_whatsapp),l.utm_source,l.utm_medium,l.utm_campaign,l.created_at,
 count(*) OVER(),l.submitted,m.member_no,m.confirmed_at,
 coalesce(c.consent_whatsapp_source,CASE WHEN coalesce(c.consent_whatsapp,l.consent_whatsapp) THEN 'form_legacy_sem_prova' END),
 coalesce(public.crm_whatsapp_eligible(c.id),false)
 FROM people l LEFT JOIN LATERAL (
 SELECT cm.* FROM public.club_members cm JOIN public.portal_sites ps ON ps.id=cm.site_id AND ps.company_id=cm.company_id AND ps.brand_key='newgang'
 WHERE cm.company_id=l.company_id AND lower(btrim(cm.email))=l.normalized_email ORDER BY cm.created_at,cm.id LIMIT 1
 ) m ON true LEFT JOIN public.contacts c ON c.id=m.contact_id AND c.company_id=l.company_id
 WHERE coalesce(btrim(p_search),'')='' OR l.name ILIKE '%'||btrim(p_search)||'%' OR l.normalized_email ILIKE '%'||btrim(p_search)||'%'
 ORDER BY l.created_at DESC,l.id LIMIT least(greatest(coalesce(p_limit,50),1),1000) OFFSET greatest(coalesce(p_offset,0),0);
END $$;
DO $$ DECLARE a record; owner_name text; role_name text; BEGIN
 SELECT pg_get_userbyid(proowner) INTO owner_name FROM _ng_acl;
 EXECUTE format('ALTER FUNCTION public.clube_newgang_list(text,int,int) OWNER TO %I',owner_name);
 FOR a IN SELECT DISTINCT grantee FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid='public.clube_newgang_list(text,int,int)'::regprocedure)) LOOP
 role_name:=CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END;
 EXECUTE 'REVOKE ALL ON FUNCTION public.clube_newgang_list(text,int,int) FROM '||role_name;
 END LOOP;
 FOR a IN SELECT * FROM aclexplode((SELECT proacl FROM _ng_acl)) LOOP
 role_name:=CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END;
 EXECUTE 'GRANT EXECUTE ON FUNCTION public.clube_newgang_list(text,int,int) TO '||role_name||CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.clube_newgang_summary() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v jsonb; v_today date:=(now() AT TIME ZONE 'Europe/Lisbon')::date; BEGIN
 PERFORM public._clube_newgang_assert_access();
 WITH first_capture AS (SELECT DISTINCT ON (lower(btrim(email))) * FROM public.lead_capture WHERE source='clube_newgang' AND public.row_belongs_to_current_company(company_id) AND email IS NOT NULL ORDER BY lower(btrim(email)),created_at,id), b AS (SELECT (created_at AT TIME ZONE 'Europe/Lisbon')::date AS d,public.club_city_display(raw->>'residence_country',raw->>'city') AS city,coalesce(nullif(utm_source,''),'(direto)')||' / '||coalesce(nullif(utm_medium,''),'—')||' / '||coalesce(nullif(utm_campaign,''),'—') AS utm,public._clube_newgang_birth(raw) AS bd FROM first_capture),a AS (SELECT *,CASE WHEN bd IS NULL THEN 'sem data' ELSE CASE WHEN extract(year FROM age(v_today,bd))<18 THEN '<18' WHEN extract(year FROM age(v_today,bd))<25 THEN '18–24' WHEN extract(year FROM age(v_today,bd))<35 THEN '25–34' WHEN extract(year FROM age(v_today,bd))<45 THEN '35–44' ELSE '45+' END END AS faixa FROM b)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM a),'today',(SELECT count(*) FROM a WHERE d=v_today),'last7',(SELECT count(*) FROM a WHERE d>v_today-7),'by_day',coalesce((SELECT jsonb_agg(jsonb_build_object('d',d,'n',n) ORDER BY d) FROM (SELECT d,count(*) n FROM a GROUP BY d)x),'[]'::jsonb),'by_city',coalesce((SELECT jsonb_agg(jsonb_build_object('k',k,'n',n) ORDER BY n DESC,k) FROM (SELECT coalesce(min(city),'(sem cidade)') k,count(*) n FROM a GROUP BY public.club_city_key(city) ORDER BY 2 DESC,1 LIMIT 10)x),'[]'::jsonb),'by_utm',coalesce((SELECT jsonb_agg(jsonb_build_object('k',utm,'n',n) ORDER BY n DESC,utm) FROM (SELECT utm,count(*) n FROM a GROUP BY 1 ORDER BY 2 DESC,1 LIMIT 20)x),'[]'::jsonb),'by_age',(SELECT jsonb_agg(jsonb_build_object('k',f,'n',(SELECT count(*) FROM a WHERE faixa=f)) ORDER BY o) FROM unnest(ARRAY['<18','18–24','25–34','35–44','45+','sem data']) WITH ORDINALITY AS t(f,o))) INTO v; RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.crm_filter_match(c public.contacts, f jsonb, p_coala jsonb)
 RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT COALESCE(CASE f->>'field'
    WHEN 'has_email' THEN (c.email IS NOT NULL) = (f->>'value')::boolean
    WHEN 'has_phone' THEN (c.phone_e164 IS NOT NULL) = (f->>'value')::boolean
    WHEN 'consent_email' THEN c.consent_email = (f->>'value')::boolean
    WHEN 'consent_whatsapp' THEN public.crm_whatsapp_eligible(c.id) = (f->>'value')::boolean
    WHEN 'is_active' THEN c.is_active = (f->>'value')::boolean
    WHEN 'source' THEN CASE f->>'op'
        WHEN 'eq' THEN c.source = f->>'value'
        WHEN 'neq' THEN c.source <> f->>'value'
        WHEN 'in' THEN c.source IN (SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(f->'value')='array' THEN f->'value' ELSE '[]'::jsonb END))
      END
    WHEN 'created_at' THEN CASE f->>'op'
        WHEN 'gte' THEN c.created_at >= (f->>'value')::date
        WHEN 'lte' THEN c.created_at <= (f->>'value')::date
        WHEN 'last_n_days' THEN c.created_at >= now() - make_interval(days => COALESCE((f->>'value')::int, 0))
      END
    WHEN 'last_activity_at' THEN CASE f->>'op'
        WHEN 'gte' THEN c.last_activity_at >= (f->>'value')::date
        WHEN 'lte' THEN c.last_activity_at <= (f->>'value')::date
        WHEN 'last_n_days' THEN c.last_activity_at >= now() - make_interval(days => COALESCE((f->>'value')::int, 0))
      END
    WHEN 'coala_list' THEN
      f->>'value' = 'eb2027'
      AND c.company_id = '7d831e59-6e82-427b-95a0-64904aae5dd2'::uuid
      AND c.email IS NOT NULL
      AND p_coala ? lower(btrim(c.email))
  END, false)
$$;

CREATE OR REPLACE FUNCTION public.crm_contacts_by_audience(
  p_audience_id uuid, p_search text DEFAULT NULL, p_email text DEFAULT 'all', p_wa text DEFAULT 'all',
  p_active text DEFAULT 'all', p_source text DEFAULT 'all', p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
declare v_set jsonb := public.crm_coala_list_set(); v jsonb;
begin
  WITH a AS (
    SELECT * FROM public.audiences
     WHERE id = p_audience_id AND company_id = public.current_company_id()
       AND public.crm_audience_is_visible(criterion)
  ), base AS (
    SELECT c.id, c.name, c.email, c.phone_e164, c.source, c.consent_email, c.consent_whatsapp, c.consent_whatsapp_source, public.crm_whatsapp_eligible(c.id) AS whatsapp_eligible, c.is_active, c.last_activity_at
      FROM public.contacts c, a
     WHERE c.company_id = a.company_id
       AND public.crm_criterion_match(c, a.criterion, v_set)
       AND (COALESCE(btrim(p_search),'') = '' OR c.name ILIKE '%'||btrim(p_search)||'%'
            OR c.email ILIKE '%'||btrim(p_search)||'%' OR c.phone_e164 ILIKE '%'||btrim(p_search)||'%')
       AND (p_email = 'all' OR c.consent_email = (p_email = 'yes'))
       AND (p_wa = 'all' OR public.crm_whatsapp_eligible(c.id) = (p_wa = 'yes'))
       AND (p_active = 'all' OR c.is_active = (p_active = 'yes'))
       AND (p_source = 'all' OR (p_source = '__none__' AND c.source IS NULL) OR c.source = p_source)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM (
        SELECT * FROM base ORDER BY last_activity_at DESC NULLS LAST, id
         OFFSET GREATEST(p_offset,0) LIMIT LEAST(GREATEST(p_limit,1),1000)) p), '[]'::jsonb))
    INTO v;
  RETURN v;
end
$$;


CREATE OR REPLACE VIEW public.crm_contactos WITH (security_invoker=true) AS
 SELECT c.id AS contact_id,c.company_id,c.name,c.email,c.phone_e164,c.consent_email,c.consent_email_at,
 c.consent_whatsapp,c.consent_whatsapp_at,c.is_active,c.source,
 coalesce(l.first_at,c.first_seen_at) AS first_contact_at,coalesce(l.last_at,c.last_activity_at) AS last_contact_at,
 coalesce(l.interactions,0::bigint) AS interactions,l.last_event_id,l.last_kind,c.created_at,c.updated_at,
 c.consent_whatsapp_source
 FROM public.contacts c LEFT JOIN (
 SELECT x.contact_id,min(x.created_at) first_at,max(x.created_at) last_at,count(*) interactions,
 (array_agg(x.event_id ORDER BY x.created_at DESC))[1] last_event_id,
 (array_agg(x.kind ORDER BY x.created_at DESC))[1] last_kind
 FROM public.leads x WHERE x.kind=ANY(ARRAY['event_interest','newsletter_signup']) AND x.contact_id IS NOT NULL GROUP BY x.contact_id
 ) l ON l.contact_id=c.id WHERE c.email IS NOT NULL OR c.phone_e164 IS NOT NULL;
COMMENT ON FUNCTION public.clube_newgang_summary() IS 'CRM Newgang: one normalized email; first capture (created_at,id) determines date, city, UTM and age. No historical records changed.';
