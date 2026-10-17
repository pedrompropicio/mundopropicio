-- #332: additive person consent. No historical updates, no delivery, no seed.
ALTER TABLE public.marketing_consent_events DROP CONSTRAINT marketing_consent_events_purpose_check;
ALTER TABLE public.marketing_consent_events ADD CONSTRAINT marketing_consent_events_purpose_check
 CHECK (purpose IN ('meta_ads','tiktok_ads','google_ads'));

CREATE TABLE public.club_member_marketing_consents (
 event_id bigint PRIMARY KEY REFERENCES public.marketing_consent_events(id),
 member_id uuid NOT NULL REFERENCES public.club_members(id),
 site_id uuid NOT NULL REFERENCES public.portal_sites(id),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 subject_id uuid NOT NULL REFERENCES public.marketing_consent_subjects(id),
 purpose text NOT NULL CHECK(purpose IN ('meta_ads','tiktok_ads','google_ads')),
 request_key uuid NOT NULL, request_payload jsonb NOT NULL,
 UNIQUE(member_id,site_id,purpose,request_key)
);
REVOKE ALL ON public.club_member_marketing_consents FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.club_member_marketing_consents FROM service_role;
GRANT SELECT ON public.club_member_marketing_consents TO service_role;
ALTER TABLE public.club_member_marketing_consents ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.club_member_email_consents (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id uuid NOT NULL REFERENCES public.club_members(id),
 site_id uuid NOT NULL REFERENCES public.portal_sites(id),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 version text NOT NULL CHECK(version='email-v3'),
 decision text NOT NULL CHECK(decision IN ('granted','revoked')),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 origin text NOT NULL CHECK(origin IN ('club_session','email_unsubscribe')),
 idempotency_key uuid NOT NULL, UNIQUE(member_id,site_id,idempotency_key)
);
REVOKE ALL ON public.club_member_email_consents FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.club_member_email_consents FROM service_role;
GRANT SELECT ON public.club_member_email_consents TO service_role;
GRANT USAGE ON SEQUENCE public.club_member_email_consents_id_seq TO service_role;
ALTER TABLE public.club_member_email_consents ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public._club332_history_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE m record; e record;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'consent_history_immutable'; END IF;
 SELECT cm.* INTO m FROM public.club_members cm JOIN public.portal_sites s
 ON s.id=cm.site_id AND s.company_id=cm.company_id
 WHERE cm.id=NEW.member_id AND cm.site_id=NEW.site_id AND cm.company_id=NEW.company_id AND s.brand_key='newgang';
 IF NOT FOUND THEN RAISE EXCEPTION 'consent_scope'; END IF;
 IF TG_TABLE_NAME='club_member_marketing_consents' THEN
  SELECT * INTO e FROM public.marketing_consent_events WHERE id=NEW.event_id;
  IF e.subject_id IS DISTINCT FROM NEW.subject_id OR e.company_id IS DISTINCT FROM NEW.company_id
   OR e.portal IS DISTINCT FROM 'newgang' OR e.purpose IS DISTINCT FROM NEW.purpose
   OR e.banner_version IS DISTINCT FROM 'anuncios-v1' OR e.idempotency_key IS DISTINCT FROM NEW.request_key
   OR e.state IS DISTINCT FROM NEW.request_payload->>'decision'
   OR NOT EXISTS(SELECT 1 FROM public.marketing_consent_subjects s WHERE s.id=NEW.subject_id AND s.company_id=NEW.company_id AND s.portal='newgang')
   THEN RAISE EXCEPTION 'consent_scope'; END IF;
  IF EXISTS(SELECT 1 FROM public.club_member_marketing_consents l WHERE l.subject_id=NEW.subject_id
   AND (l.member_id<>NEW.member_id OR l.site_id<>NEW.site_id OR l.purpose<>NEW.purpose)) THEN RAISE EXCEPTION 'consent_scope'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER club332_marketing_history BEFORE INSERT OR UPDATE OR DELETE ON public.club_member_marketing_consents
 FOR EACH ROW EXECUTE FUNCTION public._club332_history_guard();
CREATE TRIGGER club332_email_history BEFORE INSERT OR UPDATE OR DELETE ON public.club_member_email_consents
 FOR EACH ROW EXECUTE FUNCTION public._club332_history_guard();
CREATE TRIGGER club332_marketing_no_truncate BEFORE TRUNCATE ON public.club_member_marketing_consents
 FOR EACH STATEMENT EXECUTE FUNCTION public._club332_history_guard();
CREATE TRIGGER club332_email_no_truncate BEFORE TRUNCATE ON public.club_member_email_consents
 FOR EACH STATEMENT EXECUTE FUNCTION public._club332_history_guard();

-- Authoritative session identity, shared by read and write RPCs. No browser member/company IDs.
CREATE FUNCTION public._club332_session(p_site uuid,p_session_hash text) RETURNS uuid
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE m uuid;
BEGIN
 SELECT cm.id INTO m FROM public.club_member_sessions x JOIN public.club_members cm ON cm.id=x.member_id
 JOIN public.portal_sites s ON s.id=cm.site_id AND s.company_id=cm.company_id
 WHERE x.site_id=p_site AND cm.site_id=p_site AND x.token_hash=p_session_hash AND x.purpose='access'
 AND x.expires_at>clock_timestamp() AND cm.confirmed_at IS NOT NULL AND s.active AND s.brand_key='newgang'
 AND s.company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c'::uuid;
 IF m IS NULL THEN RAISE EXCEPTION 'no_session'; END IF;
 RETURN m;
END $$;

CREATE FUNCTION public._club332_email_append(p_member uuid,p_site uuid,p_decision text,p_key uuid,p_origin text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE old public.club_member_email_consents; co uuid;
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN ('granted','revoked') OR p_key IS NULL THEN RAISE EXCEPTION 'consent_payload'; END IF;
 SELECT company_id INTO co FROM public.club_members WHERE id=p_member AND site_id=p_site;
 IF co IS NULL THEN RAISE EXCEPTION 'consent_scope'; END IF;
 SELECT * INTO old FROM public.club_member_email_consents WHERE member_id=p_member AND site_id=p_site AND idempotency_key=p_key;
 IF FOUND THEN
  IF old.decision<>p_decision OR old.origin<>p_origin THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  RETURN;
 END IF;
 INSERT INTO public.club_member_email_consents(member_id,site_id,company_id,version,decision,origin,idempotency_key)
 VALUES(p_member,p_site,co,'email-v3',p_decision,p_origin,p_key);
END $$;

-- Called only under site-before-member lock. One opaque, server-created subject per person/site/purpose.
CREATE FUNCTION public._club332_ads_append(p_member uuid,p_site uuid,p_decision text,p_purposes text[],p_key uuid,p_origin text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE co uuid; purpose_name text; sub uuid; eid bigint; rev bigint; policy text; payload jsonb; prior jsonb; sorted text[];
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN ('granted','revoked') OR p_key IS NULL
 OR p_purposes IS NULL OR cardinality(p_purposes) NOT BETWEEN 1 AND 3
 OR EXISTS(SELECT 1 FROM unnest(p_purposes) p WHERE p IS NULL OR p NOT IN ('meta_ads','tiktok_ads','google_ads'))
 OR cardinality(p_purposes)<>(SELECT count(DISTINCT p) FROM unnest(p_purposes) p) THEN RAISE EXCEPTION 'consent_payload'; END IF;
 SELECT array_agg(p ORDER BY p) INTO sorted FROM unnest(p_purposes) p;
 payload:=jsonb_build_object('decision',p_decision,'purposes',sorted,'version','anuncios-v1','origin',p_origin);
 SELECT request_payload INTO prior FROM public.club_member_marketing_consents
 WHERE member_id=p_member AND site_id=p_site AND request_key=p_key LIMIT 1;
 IF FOUND THEN
  IF prior<>payload THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  RETURN;
 END IF;
 SELECT company_id INTO co FROM public.club_members WHERE id=p_member AND site_id=p_site;
 IF co IS NULL THEN RAISE EXCEPTION 'consent_scope'; END IF;
 SELECT policy_version INTO policy FROM public.marketing_consent_policies WHERE portal='newgang'
 AND valid_from<=clock_timestamp() AND (valid_to IS NULL OR valid_to>clock_timestamp()) ORDER BY valid_from DESC LIMIT 1;
 IF policy IS NULL AND p_decision='granted' THEN RAISE EXCEPTION 'consent_policy_unavailable'; END IF;
 policy:=coalesce(policy,'revoked');
 FOREACH purpose_name IN ARRAY sorted LOOP
  SELECT l.subject_id INTO sub FROM public.club_member_marketing_consents l
  WHERE l.member_id=p_member AND l.site_id=p_site AND l.purpose=purpose_name ORDER BY l.event_id DESC LIMIT 1;
  IF sub IS NULL THEN
   INSERT INTO public.marketing_consent_subjects(company_id,portal,token_hash)
   VALUES(co,'newgang',encode(extensions.digest(extensions.gen_random_bytes(32),'sha256'),'hex')) RETURNING id INTO sub;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('mcs:'||sub::text,0));
  SELECT coalesce(max(revision),0)+1 INTO rev FROM public.marketing_consent_events WHERE subject_id=sub;
  INSERT INTO public.marketing_consent_events(subject_id,company_id,portal,state,purpose,policy_version,banner_version,
   client_seq,idempotency_key,origin,path,revision,expected_revision)
  VALUES(sub,co,'newgang',p_decision,purpose_name,policy,'anuncios-v1',rev,p_key,p_origin,'/clube/perfil',rev,rev-1) RETURNING id INTO eid;
  INSERT INTO public.club_member_marketing_consents(event_id,member_id,site_id,company_id,subject_id,purpose,request_key,request_payload)
  VALUES(eid,p_member,p_site,co,sub,purpose_name,p_key,payload);
 END LOOP;
END $$;

CREATE FUNCTION public._club332_state(p_member uuid,p_site uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE result jsonb; ads jsonb; em record;
BEGIN
 SELECT decision,version,decided_at INTO em FROM public.club_member_email_consents
 WHERE member_id=p_member AND site_id=p_site ORDER BY id DESC LIMIT 1;
 SELECT jsonb_object_agg(p.purpose,jsonb_build_object('state',coalesce(e.state,'unknown'),
  'version',e.banner_version,'date',e.server_received_at)) INTO ads
 FROM unnest(ARRAY['meta_ads','tiktok_ads','google_ads']) p(purpose)
 LEFT JOIN LATERAL (SELECT ev.state,ev.banner_version,ev.server_received_at FROM public.club_member_marketing_consents l
 JOIN public.marketing_consent_events ev ON ev.id=l.event_id
 WHERE l.member_id=p_member AND l.site_id=p_site AND l.purpose=p.purpose ORDER BY ev.revision DESC,ev.id DESC LIMIT 1) e ON true;
 result:=jsonb_build_object('email',jsonb_build_object('state',coalesce(em.decision,'unknown'),'version',em.version,'date',em.decided_at),'ads',ads);
 RETURN result;
END $$;

CREATE FUNCTION public.club_consent_state(p_site uuid,p_session_hash text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN RETURN public._club332_state(public._club332_session(p_site,p_session_hash),p_site); END $$;

CREATE FUNCTION public.club_profile_preferences(p_site uuid,p_session_hash text,p_payload jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE m uuid; again uuid; decision text; v_key uuid; purposes text[]; bd date;
 current_state jsonb; prior_key boolean; expected jsonb; purpose_name text;
BEGIN
 m:=public._club332_session(p_site,p_session_hash);
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) fields(key)
 WHERE fields.key NOT IN ('channel','version','granted','platforms','idempotency_key','expected_dates'))
 OR jsonb_typeof(p_payload->'granted') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'consent_payload'; END IF;
 BEGIN v_key:=(p_payload->>'idempotency_key')::uuid; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'consent_payload'; END;
 IF v_key IS NULL THEN RAISE EXCEPTION 'consent_payload'; END IF;
 decision:=CASE WHEN (p_payload->>'granted')::boolean THEN 'granted' ELSE 'revoked' END;
 PERFORM public._club_site_lock(p_site,false);
 PERFORM 1 FROM public.club_members WHERE id=m FOR NO KEY UPDATE;
 again:=public._club332_session(p_site,p_session_hash);
 IF again<>m THEN RAISE EXCEPTION 'no_session'; END IF;
 IF decision='granted' THEN
  SELECT birth_date INTO bd FROM public.club_member_profiles WHERE member_id=m AND site_id=p_site;
  -- No verified parental adapter: absence/clearing never bypasses a known age restriction.
  IF bd IS NULL OR bd>((clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date-interval '13 years')::date THEN RAISE EXCEPTION 'parental_flow_required'; END IF;
 END IF;
 IF p_payload->>'channel'='email' THEN
  IF p_payload->>'version' IS DISTINCT FROM 'email-v3' OR p_payload ? 'platforms' THEN RAISE EXCEPTION 'consent_payload'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.club_member_email_consents WHERE member_id=m AND site_id=p_site AND idempotency_key=v_key) INTO prior_key;
  IF decision='granted' AND NOT prior_key THEN
   current_state:=public._club332_state(m,p_site); expected:=p_payload->'expected_dates';
   IF jsonb_typeof(expected) IS DISTINCT FROM 'object' OR NOT expected ? 'email'
    OR expected->'email' IS DISTINCT FROM current_state#>'{email,date}' THEN RAISE EXCEPTION 'consent_revision_conflict'; END IF;
  END IF;
  PERFORM public._club332_email_append(m,p_site,decision,v_key,'club_session');
 ELSIF p_payload->>'channel'='ads' THEN
  IF p_payload->>'version' IS DISTINCT FROM 'anuncios-v1' OR jsonb_typeof(p_payload->'platforms') IS DISTINCT FROM 'array'
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'platforms') v WHERE jsonb_typeof(v)<>'string') THEN RAISE EXCEPTION 'consent_payload'; END IF;
  SELECT array_agg(v) INTO purposes FROM jsonb_array_elements_text(p_payload->'platforms') v;
  IF cardinality(purposes) IS NULL OR cardinality(purposes) NOT BETWEEN 1 AND 3
   OR EXISTS(SELECT 1 FROM unnest(purposes) p WHERE p NOT IN ('meta_ads','tiktok_ads','google_ads'))
   OR cardinality(purposes)<>(SELECT count(DISTINCT p) FROM unnest(purposes) p) THEN RAISE EXCEPTION 'consent_payload'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.club_member_marketing_consents WHERE member_id=m AND site_id=p_site AND request_key=v_key) INTO prior_key;
  IF decision='granted' AND NOT prior_key THEN
   current_state:=public._club332_state(m,p_site); expected:=p_payload->'expected_dates';
   IF jsonb_typeof(expected) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'consent_revision_conflict'; END IF;
   FOREACH purpose_name IN ARRAY purposes LOOP
    IF NOT expected ? purpose_name OR expected->purpose_name IS DISTINCT FROM current_state#>ARRAY['ads',purpose_name,'date']
     THEN RAISE EXCEPTION 'consent_revision_conflict'; END IF;
   END LOOP;
  END IF;
  PERFORM public._club332_ads_append(m,p_site,decision,purposes,v_key,'club_session');
 ELSE RAISE EXCEPTION 'consent_payload'; END IF;
 RETURN jsonb_build_object('ok',true,'consents',public._club332_state(m,p_site));
END $$;

-- Atomic token claim + suppression + Newgang person revocation. MP/Coala retain their existing suppression semantics.
CREATE FUNCTION public.email_unsubscribe_atomic(p_token text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE tok public.email_unsubscribe_tokens; m record;
BEGIN
 SELECT * INTO tok FROM public.email_unsubscribe_tokens WHERE token=p_token FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','Invalid or expired token'); END IF;
 IF tok.used_at IS NOT NULL THEN RETURN jsonb_build_object('valid',false,'reason','already_unsubscribed'); END IF;
 -- All site locks precede all member locks, including multi-site unsubscribe.
 FOR m IN SELECT DISTINCT cm.site_id FROM public.club_members cm JOIN public.portal_sites s ON s.id=cm.site_id AND s.company_id=cm.company_id
 WHERE cm.company_id=tok.company_id AND lower(btrim(cm.email))=lower(btrim(tok.email)) AND s.brand_key='newgang' ORDER BY cm.site_id LOOP
  PERFORM public._club_site_lock(m.site_id,false);
 END LOOP;
 FOR m IN SELECT cm.id,cm.site_id FROM public.club_members cm JOIN public.portal_sites s ON s.id=cm.site_id AND s.company_id=cm.company_id
 WHERE cm.company_id=tok.company_id AND lower(btrim(cm.email))=lower(btrim(tok.email)) AND s.brand_key='newgang'
 ORDER BY cm.site_id,cm.id LOOP
  PERFORM 1 FROM public.club_members WHERE id=m.id FOR NO KEY UPDATE;
  PERFORM public._club332_email_append(m.id,m.site_id,'revoked',tok.id,'email_unsubscribe');
  PERFORM public._club332_ads_append(m.id,m.site_id,'revoked',ARRAY['meta_ads','tiktok_ads','google_ads'],tok.id,'email_unsubscribe');
 END LOOP;
 INSERT INTO public.suppressed_emails(email,reason,company_id) VALUES(lower(btrim(tok.email)),'unsubscribe',tok.company_id)
 ON CONFLICT(email,company_id) DO UPDATE SET reason=EXCLUDED.reason;
 UPDATE public.email_unsubscribe_tokens SET used_at=clock_timestamp() WHERE id=tok.id;
 RETURN jsonb_build_object('success',true);
END $$;

-- Internal temporal proof: exact decision must be current both at capture and now. Regrant never rescues old work.
CREATE FUNCTION public.club_marketing_binding_valid(p_member uuid,p_site uuid,p_purpose text,p_event bigint,p_captured_at timestamptz)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
 SELECT coalesce(EXISTS(SELECT 1 FROM public.club_member_marketing_consents l JOIN public.marketing_consent_events e ON e.id=l.event_id
 WHERE l.member_id=p_member AND l.site_id=p_site AND l.purpose=p_purpose AND e.id=p_event AND e.state='granted'
 AND e.server_received_at<=p_captured_at AND e.banner_version='anuncios-v1'
 AND NOT EXISTS(SELECT 1 FROM public.marketing_consent_events n WHERE n.subject_id=e.subject_id AND n.revision>e.revision)
 AND EXISTS(SELECT 1 FROM public.marketing_consent_effective(e.subject_id,p_captured_at) f WHERE f.event_id=e.id AND f.valid_grant)
 AND EXISTS(SELECT 1 FROM public.marketing_consent_effective(e.subject_id,clock_timestamp()) f WHERE f.event_id=e.id AND f.valid_grant)),false);
$$;

DO $$ DECLARE f text; BEGIN
 FOREACH f IN ARRAY ARRAY['_club332_history_guard()','_club332_session(uuid,text)','_club332_email_append(uuid,uuid,text,uuid,text)',
 '_club332_ads_append(uuid,uuid,text,text[],uuid,text)','_club332_state(uuid,uuid)','club_consent_state(uuid,text)',
 'club_profile_preferences(uuid,text,jsonb)','email_unsubscribe_atomic(text)','club_marketing_binding_valid(uuid,uuid,text,bigint,timestamptz)'] LOOP
 EXECUTE 'REVOKE EXECUTE ON FUNCTION public.'||f||' FROM PUBLIC,anon,authenticated';
 EXECUTE 'REVOKE EXECUTE ON FUNCTION public.'||f||' FROM service_role';
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.club_consent_state(uuid,text),public.club_profile_preferences(uuid,text,jsonb),
 public.email_unsubscribe_atomic(text),public.club_marketing_binding_valid(uuid,uuid,text,bigint,timestamptz) TO service_role;