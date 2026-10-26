# #314 Fase 1 — diff das funções (antes = Live 26/10/2026 ~20:20 UTC; depois = 0266)

Atributos (prosecdef, proconfig, proacl) iguais antes/depois em todas; ver fase1.md.

## _club332_email_append

```diff
--- antes
+++ depois
@@ -1,18 +0,0 @@
-CREATE OR REPLACE FUNCTION public._club332_email_append(p_member uuid, p_site uuid, p_decision text, p_key uuid, p_origin text)
- RETURNS void
- LANGUAGE plpgsql
- SECURITY DEFINER
- SET search_path TO 'public', 'pg_catalog'
-AS $function$
-DECLARE old public.club_member_email_consents; co uuid;
-BEGIN
- IF p_decision IS NULL OR p_decision NOT IN ('granted','revoked') OR p_key IS NULL THEN RAISE EXCEPTION 'consent_payload'; END IF;
- SELECT company_id INTO co FROM public.club_members WHERE id=p_member AND site_id=p_site;
- IF co IS NULL THEN RAISE EXCEPTION 'consent_scope'; END IF;
- SELECT * INTO old FROM public.club_member_email_consents WHERE member_id=p_member AND site_id=p_site AND idempotency_key=p_key;
- IF FOUND THEN IF old.decision<>p_decision OR old.origin<>p_origin THEN RAISE EXCEPTION 'idempotency_conflict'; END IF; RETURN; END IF;
- IF p_decision='granted' AND NOT EXISTS (SELECT 1 FROM public.consent_text_versions v WHERE v.company_id=co AND v.version='email-v3' AND v.channel='email' AND v.locale='pt' AND v.valid_from<=clock_timestamp() AND (v.valid_to IS NULL OR v.valid_to>clock_timestamp())) THEN RAISE EXCEPTION 'consent_text_unregistered'; END IF;
- INSERT INTO public.club_member_email_consents(member_id,site_id,company_id,version,decision,origin,idempotency_key) VALUES(p_member,p_site,co,'email-v3',p_decision,p_origin,p_key);
-END
-$function$
-
```

## _club332_ads_append

```diff
--- antes
+++ depois
@@ -1,30 +0,0 @@
-CREATE OR REPLACE FUNCTION public._club332_ads_append(p_member uuid, p_site uuid, p_decision text, p_purposes text[], p_key uuid, p_origin text)
- RETURNS void
- LANGUAGE plpgsql
- SECURITY DEFINER
- SET search_path TO 'public', 'pg_catalog'
-AS $function$
-DECLARE co uuid; purpose_name text; sub uuid; eid bigint; rev bigint; policy text; payload jsonb; prior jsonb; sorted text[];
-BEGIN
- IF p_decision IS NULL OR p_decision NOT IN ('granted','revoked') OR p_key IS NULL OR p_purposes IS NULL OR cardinality(p_purposes) NOT BETWEEN 1 AND 3 OR EXISTS(SELECT 1 FROM unnest(p_purposes) p WHERE p IS NULL OR p NOT IN ('meta_ads','tiktok_ads','google_ads')) OR cardinality(p_purposes)<>(SELECT count(DISTINCT p) FROM unnest(p_purposes) p) THEN RAISE EXCEPTION 'consent_payload'; END IF;
- SELECT array_agg(p ORDER BY p) INTO sorted FROM unnest(p_purposes) p;
- payload:=jsonb_build_object('decision',p_decision,'purposes',sorted,'version','anuncios-v1','origin',p_origin);
- SELECT request_payload INTO prior FROM public.club_member_marketing_consents WHERE member_id=p_member AND site_id=p_site AND request_key=p_key LIMIT 1;
- IF FOUND THEN IF prior<>payload THEN RAISE EXCEPTION 'idempotency_conflict'; END IF; RETURN; END IF;
- SELECT company_id INTO co FROM public.club_members WHERE id=p_member AND site_id=p_site;
- IF co IS NULL THEN RAISE EXCEPTION 'consent_scope'; END IF;
- IF p_decision='granted' AND NOT EXISTS (SELECT 1 FROM public.consent_text_versions v WHERE v.company_id=co AND v.version='anuncios-v1' AND v.channel='ads' AND v.locale='pt' AND v.valid_from<=clock_timestamp() AND (v.valid_to IS NULL OR v.valid_to>clock_timestamp())) THEN RAISE EXCEPTION 'consent_text_unregistered'; END IF;
- SELECT policy_version INTO policy FROM public.marketing_consent_policies WHERE portal='newgang' AND valid_from<=clock_timestamp() AND (valid_to IS NULL OR valid_to>clock_timestamp()) ORDER BY valid_from DESC LIMIT 1;
- IF policy IS NULL AND p_decision='granted' THEN RAISE EXCEPTION 'consent_policy_unavailable'; END IF;
- policy:=coalesce(policy,'revoked');
- FOREACH purpose_name IN ARRAY sorted LOOP
- SELECT l.subject_id INTO sub FROM public.club_member_marketing_consents l WHERE l.member_id=p_member AND l.site_id=p_site AND l.purpose=purpose_name ORDER BY l.event_id DESC LIMIT 1;
- IF sub IS NULL THEN INSERT INTO public.marketing_consent_subjects(company_id,portal,token_hash) VALUES(co,'newgang',encode(extensions.digest(extensions.gen_random_bytes(32),'sha256'),'hex')) RETURNING id INTO sub; END IF;
- PERFORM pg_advisory_xact_lock(hashtextextended('mcs:'||sub::text,0));
- SELECT coalesce(max(revision),0)+1 INTO rev FROM public.marketing_consent_events WHERE subject_id=sub;
- INSERT INTO public.marketing_consent_events(subject_id,company_id,portal,state,purpose,policy_version,banner_version,client_seq,idempotency_key,origin,path,revision,expected_revision) VALUES(sub,co,'newgang',p_decision,purpose_name,policy,'anuncios-v1',rev,p_key,p_origin,'/clube/perfil',rev,rev-1) RETURNING id INTO eid;
- INSERT INTO public.club_member_marketing_consents(event_id,member_id,site_id,company_id,subject_id,purpose,request_key,request_payload) VALUES(eid,p_member,p_site,co,sub,purpose_name,p_key,payload);
- END LOOP;
-END
-$function$
-
```

## _club332_whatsapp_append

```diff
--- antes
+++ depois
@@ -1,23 +0,0 @@
-CREATE OR REPLACE FUNCTION public._club332_whatsapp_append(p_member uuid, p_site uuid, p_decision text, p_key uuid, p_origin text)
- RETURNS void
- LANGUAGE plpgsql
- SECURITY DEFINER
- SET search_path TO 'public', 'extensions', 'pg_catalog'
-AS $function$
-DECLARE old public.club_member_whatsapp_consents; co uuid; ph text; fp text;
-BEGIN
- IF p_decision IS NULL OR p_decision NOT IN ('granted','revoked') OR p_key IS NULL THEN RAISE EXCEPTION 'consent_payload'; END IF;
- SELECT company_id, phone INTO co, ph FROM public.club_members WHERE id=p_member AND site_id=p_site;
- IF co IS NULL THEN RAISE EXCEPTION 'consent_scope'; END IF;
- SELECT * INTO old FROM public.club_member_whatsapp_consents WHERE member_id=p_member AND site_id=p_site AND idempotency_key=p_key;
- IF FOUND THEN IF old.decision<>p_decision OR old.origin<>p_origin THEN RAISE EXCEPTION 'idempotency_conflict'; END IF; RETURN; END IF;
- IF p_decision='granted' THEN
-   IF ph IS NULL OR ph !~ '^\+[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'whatsapp_no_phone'; END IF;
-   IF NOT EXISTS (SELECT 1 FROM public.consent_text_versions v WHERE v.company_id=co AND v.version='whatsapp-v1' AND v.channel='whatsapp' AND v.locale='pt' AND v.valid_from<=clock_timestamp() AND (v.valid_to IS NULL OR v.valid_to>clock_timestamp())) THEN RAISE EXCEPTION 'consent_text_unregistered'; END IF;
- END IF;
- fp:=public._club332_whatsapp_fp(ph);
- INSERT INTO public.club_member_whatsapp_consents(member_id,site_id,company_id,version,decision,origin,phone_fp,idempotency_key)
- VALUES(p_member,p_site,co,'whatsapp-v1',p_decision,p_origin,fp,p_key);
-END
-$function$
-
```

## _club332_consent_from_lead_capture

```diff
--- antes
+++ depois
@@ -1,30 +0,0 @@
-CREATE OR REPLACE FUNCTION public._club332_consent_from_lead_capture()
- RETURNS trigger
- LANGUAGE plpgsql
- SECURITY DEFINER
- SET search_path TO 'public', 'extensions', 'pg_catalog'
-AS $function$
-DECLARE s_id uuid; s_co uuid; mid uuid; v_email text; v_version text; v_key uuid;
-BEGIN
-  IF NEW.source IS DISTINCT FROM 'clube_newgang' OR NEW.email IS NULL THEN RETURN NEW; END IF;
-  IF coalesce(NEW.consent_email,false) <> true THEN RETURN NEW; END IF;
-  v_version := NEW.raw->>'consent_text_version';
-  IF v_version IS DISTINCT FROM 'email-v3' THEN RETURN NEW; END IF;
-  SELECT id, company_id INTO s_id, s_co FROM public.portal_sites
-   WHERE brand_key='newgang' AND active AND company_id=NEW.company_id ORDER BY created_at LIMIT 1;
-  IF s_id IS NULL THEN RETURN NEW; END IF;
-  v_email := lower(btrim(NEW.email));
-  IF EXISTS(SELECT 1 FROM public.suppressed_emails WHERE company_id=s_co AND email=v_email) THEN RETURN NEW; END IF;
-  SELECT id INTO mid FROM public.club_members WHERE site_id=s_id AND lower(btrim(email))=v_email LIMIT 1;
-  IF mid IS NULL THEN RETURN NEW; END IF;
-  v_key := regexp_replace(md5('lc332:'||NEW.id::text),'(.{8})(.{4})(.{4})(.{4})(.{12})','\1-\2-\3-\4-\5')::uuid;
-  BEGIN
-    INSERT INTO public.club_member_email_consents(member_id,site_id,company_id,version,decision,decided_at,origin,idempotency_key)
-    VALUES(mid,s_id,s_co,'email-v3','granted',NEW.created_at,'signup',v_key);
-  EXCEPTION WHEN unique_violation THEN NULL;
-  END;
-  RETURN NEW;
-EXCEPTION WHEN OTHERS THEN
-  RAISE WARNING '_club332_consent_from_lead_capture: %', SQLERRM; RETURN NEW;
-END $function$
-
```

## _club368_resubscribe_clear

```diff
--- antes
+++ depois
@@ -1,21 +0,0 @@
-CREATE OR REPLACE FUNCTION public._club368_resubscribe_clear()
- RETURNS trigger
- LANGUAGE plpgsql
- SECURITY DEFINER
- SET search_path TO 'public', 'pg_temp'
-AS $function$
-DECLARE m public.club_members; h text; n int;
-BEGIN
- IF NEW.decision <> 'granted' OR NEW.origin <> 'signup' OR NEW.version <> 'email-v3' THEN RETURN NULL; END IF;
- SELECT * INTO m FROM public.club_members WHERE id = NEW.member_id;
- IF NOT FOUND OR m.erased_at IS NOT NULL OR m.email IS NULL THEN RETURN NULL; END IF;
- h := encode(sha256(convert_to(lower(btrim(m.email)),'UTF8')),'hex');
- DELETE FROM public.suppressed_emails WHERE company_id = m.company_id AND email = 'sha256:'||h AND reason = 'erasure_request';
- GET DIAGNOSTICS n = ROW_COUNT;
- IF n > 0 THEN
-  INSERT INTO public.club_retention_log(run_id, old_member_id, email_sha256, reason, tables_affected)
-  VALUES (NEW.idempotency_key, m.id, h, 'resubscribe_clear', jsonb_build_object('suppressed_emails_hash_removed', n, 'consent_id', NEW.id));
- END IF;
- RETURN NULL;
-END $function$
-
```

## _club332_history_guard

```diff
--- antes
+++ depois
@@ -1,19 +0,0 @@
-CREATE OR REPLACE FUNCTION public._club332_history_guard()
- RETURNS trigger
- LANGUAGE plpgsql
- SECURITY DEFINER
- SET search_path TO 'public', 'pg_catalog'
-AS $function$
-DECLARE m record; e record;
-BEGIN
- IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'consent_history_immutable'; END IF;
- SELECT cm.* INTO m FROM public.club_members cm JOIN public.portal_sites s ON s.id=cm.site_id AND s.company_id=cm.company_id WHERE cm.id=NEW.member_id AND cm.site_id=NEW.site_id AND cm.company_id=NEW.company_id AND s.brand_key='newgang';
- IF NOT FOUND THEN RAISE EXCEPTION 'consent_scope'; END IF;
- IF TG_TABLE_NAME='club_member_marketing_consents' THEN
- SELECT * INTO e FROM public.marketing_consent_events WHERE id=NEW.event_id;
- IF e.subject_id IS DISTINCT FROM NEW.subject_id OR e.company_id IS DISTINCT FROM NEW.company_id OR e.portal IS DISTINCT FROM 'newgang' OR e.purpose IS DISTINCT FROM NEW.purpose OR e.banner_version IS DISTINCT FROM 'anuncios-v1' OR e.idempotency_key IS DISTINCT FROM NEW.request_key OR e.state IS DISTINCT FROM NEW.request_payload->>'decision' OR NOT EXISTS(SELECT 1 FROM public.marketing_consent_subjects s WHERE s.id=NEW.subject_id AND s.company_id=NEW.company_id AND s.portal='newgang') THEN RAISE EXCEPTION 'consent_scope'; END IF;
- IF EXISTS(SELECT 1 FROM public.club_member_marketing_consents l WHERE l.subject_id=NEW.subject_id AND (l.member_id<>NEW.member_id OR l.site_id<>NEW.site_id OR l.purpose<>NEW.purpose)) THEN RAISE EXCEPTION 'consent_scope'; END IF;
- END IF;
- RETURN NEW;
-END $function$
-
```

## club_marketing_binding_valid

```diff
--- antes
+++ depois
@@ -1,9 +0,0 @@
-CREATE OR REPLACE FUNCTION public.club_marketing_binding_valid(p_member uuid, p_site uuid, p_purpose text, p_event bigint, p_captured_at timestamp with time zone)
- RETURNS boolean
- LANGUAGE sql
- STABLE SECURITY DEFINER
- SET search_path TO 'public', 'pg_catalog'
-AS $function$
- SELECT coalesce(EXISTS(SELECT 1 FROM public.club_member_marketing_consents l JOIN public.marketing_consent_events e ON e.id=l.event_id WHERE l.member_id=p_member AND l.site_id=p_site AND l.purpose=p_purpose AND e.id=p_event AND e.state='granted' AND e.server_received_at<=p_captured_at AND e.banner_version='anuncios-v1' AND NOT EXISTS(SELECT 1 FROM public.marketing_consent_events n WHERE n.subject_id=e.subject_id AND n.revision>e.revision) AND EXISTS(SELECT 1 FROM public.marketing_consent_effective(e.subject_id,p_captured_at) f WHERE f.event_id=e.id AND f.valid_grant) AND EXISTS(SELECT 1 FROM public.marketing_consent_effective(e.subject_id,clock_timestamp()) f WHERE f.event_id=e.id AND f.valid_grant)),false);
-$function$
-
```

## club_profile_preferences

```diff
--- antes
+++ depois
@@ -1,39 +0,0 @@
-CREATE OR REPLACE FUNCTION public.club_profile_preferences(p_site uuid, p_session_hash text, p_payload jsonb)
- RETURNS jsonb
- LANGUAGE plpgsql
- SECURITY DEFINER
- SET search_path TO 'public', 'pg_catalog'
-AS $function$
-DECLARE m uuid; again uuid; decision text; v_key uuid; purposes text[]; bd date; current_state jsonb; prior_key boolean; expected jsonb; purpose_name text;
-BEGIN
- m:=public._club332_session(p_site,p_session_hash);
- IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) fields(key) WHERE fields.key NOT IN ('channel','version','granted','platforms','idempotency_key','expected_dates')) OR jsonb_typeof(p_payload->'granted') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'consent_payload'; END IF;
- BEGIN v_key:=(p_payload->>'idempotency_key')::uuid; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'consent_payload'; END;
- IF v_key IS NULL THEN RAISE EXCEPTION 'consent_payload'; END IF;
- decision:=CASE WHEN (p_payload->>'granted')::boolean THEN 'granted' ELSE 'revoked' END;
- PERFORM public._club_site_lock(p_site,false);
- PERFORM 1 FROM public.club_members WHERE id=m FOR NO KEY UPDATE;
- again:=public._club332_session(p_site,p_session_hash);
- IF again<>m THEN RAISE EXCEPTION 'no_session'; END IF;
- IF decision='granted' THEN SELECT birth_date INTO bd FROM public.club_member_profiles WHERE member_id=m AND site_id=p_site; IF bd IS NULL OR bd>((clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date-interval '13 years')::date THEN RAISE EXCEPTION 'parental_flow_required'; END IF; END IF;
- IF p_payload->>'channel'='email' THEN
-  IF p_payload->>'version' IS DISTINCT FROM 'email-v3' OR p_payload ? 'platforms' THEN RAISE EXCEPTION 'consent_payload'; END IF;
-  SELECT EXISTS(SELECT 1 FROM public.club_member_email_consents WHERE member_id=m AND site_id=p_site AND idempotency_key=v_key) INTO prior_key;
-  IF decision='granted' AND NOT prior_key THEN current_state:=public._club332_state(m,p_site); expected:=p_payload->'expected_dates'; IF jsonb_typeof(expected) IS DISTINCT FROM 'object' OR NOT expected ? 'email' OR expected->'email' IS DISTINCT FROM current_state#>'{email,date}' THEN RAISE EXCEPTION 'consent_revision_conflict'; END IF; END IF;
-  PERFORM public._club332_email_append(m,p_site,decision,v_key,'club_session');
- ELSIF p_payload->>'channel'='ads' THEN
-  IF p_payload->>'version' IS DISTINCT FROM 'anuncios-v1' OR jsonb_typeof(p_payload->'platforms') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'platforms') v WHERE jsonb_typeof(v)<>'string') THEN RAISE EXCEPTION 'consent_payload'; END IF;
-  SELECT array_agg(v) INTO purposes FROM jsonb_array_elements_text(p_payload->'platforms') v;
-  IF cardinality(purposes) IS NULL OR cardinality(purposes) NOT BETWEEN 1 AND 3 OR EXISTS(SELECT 1 FROM unnest(purposes) p WHERE p NOT IN ('meta_ads','tiktok_ads','google_ads')) OR cardinality(purposes)<>(SELECT count(DISTINCT p) FROM unnest(purposes) p) THEN RAISE EXCEPTION 'consent_payload'; END IF;
-  SELECT EXISTS(SELECT 1 FROM public.club_member_marketing_consents WHERE member_id=m AND site_id=p_site AND request_key=v_key) INTO prior_key;
-  IF decision='granted' AND NOT prior_key THEN current_state:=public._club332_state(m,p_site); expected:=p_payload->'expected_dates'; IF jsonb_typeof(expected) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'consent_revision_conflict'; END IF; FOREACH purpose_name IN ARRAY purposes LOOP IF NOT expected ? purpose_name OR expected->purpose_name IS DISTINCT FROM current_state#>ARRAY['ads',purpose_name,'date'] THEN RAISE EXCEPTION 'consent_revision_conflict'; END IF; END LOOP; END IF;
-  PERFORM public._club332_ads_append(m,p_site,decision,purposes,v_key,'club_session');
- ELSIF p_payload->>'channel'='whatsapp' THEN
-  IF p_payload->>'version' IS DISTINCT FROM 'whatsapp-v1' OR p_payload ? 'platforms' THEN RAISE EXCEPTION 'consent_payload'; END IF;
-  SELECT EXISTS(SELECT 1 FROM public.club_member_whatsapp_consents WHERE member_id=m AND site_id=p_site AND idempotency_key=v_key) INTO prior_key;
-  IF decision='granted' AND NOT prior_key THEN current_state:=public._club332_state(m,p_site); expected:=p_payload->'expected_dates'; IF jsonb_typeof(expected) IS DISTINCT FROM 'object' OR NOT expected ? 'whatsapp' OR expected->'whatsapp' IS DISTINCT FROM current_state#>'{whatsapp,date}' THEN RAISE EXCEPTION 'consent_revision_conflict'; END IF; END IF;
-  PERFORM public._club332_whatsapp_append(m,p_site,decision,v_key,'club_session');
- ELSE RAISE EXCEPTION 'consent_payload'; END IF;
- RETURN jsonb_build_object('ok',true,'consents',public._club332_state(m,p_site));
-END $function$
-
```

## _crm_whatsapp_latest

```diff
--- antes
+++ depois
@@ -1,13 +0,0 @@
-CREATE OR REPLACE FUNCTION public._crm_whatsapp_latest(p_contact uuid, p_company uuid)
- RETURNS TABLE(decision text, decided_at timestamp with time zone, phone text, phone_fp text)
- LANGUAGE sql
- STABLE SECURITY DEFINER
- SET search_path TO 'public', 'pg_temp'
-AS $function$
- SELECT w.decision,w.decided_at,m.phone,w.phone_fp
- FROM public.club_members m JOIN public.club_member_whatsapp_consents w
- ON w.member_id=m.id AND w.site_id=m.site_id AND w.company_id=m.company_id
- WHERE m.contact_id=p_contact AND m.company_id=p_company AND w.version='whatsapp-v1'
- ORDER BY w.id DESC LIMIT 1
-$function$
-
```

## crm_whatsapp_eligible

```diff
--- antes
+++ depois
@@ -1,18 +0,0 @@
-CREATE OR REPLACE FUNCTION public.crm_whatsapp_eligible(p_contact uuid)
- RETURNS boolean
- LANGUAGE plpgsql
- STABLE SECURITY DEFINER
- SET search_path TO 'public', 'pg_temp'
-AS $function$
-DECLARE c public.contacts; latest record;
-BEGIN
- SELECT * INTO c FROM public.contacts WHERE id=p_contact AND
- (public.row_belongs_to_current_company(company_id) OR auth.role()='service_role');
- IF NOT FOUND OR NOT c.consent_whatsapp OR c.phone_e164 IS NULL OR c.phone_e164 !~ '^\+[1-9][0-9]{7,14}$' THEN RETURN false; END IF;
- SELECT * INTO latest FROM public._crm_whatsapp_latest(c.id,c.company_id);
- IF FOUND THEN RETURN coalesce(latest.decision='granted' AND latest.phone=c.phone_e164
- AND latest.phone_fp=public._club332_whatsapp_fp(c.phone_e164),false); END IF;
- -- Pre-existing legacy true is preserved; explicit revocation above always prevails.
- RETURN c.consent_whatsapp_source IS DISTINCT FROM 'club_profile_whatsapp-v1';
-END $function$
-
```

## crm_meta_audience_collect_leads

```diff
--- antes
+++ depois
@@ -1,129 +0,0 @@
-CREATE OR REPLACE FUNCTION public.crm_meta_audience_collect_leads(p_audience_id uuid)
- RETURNS TABLE(email text, phone text)
- LANGUAGE plpgsql
- SECURITY DEFINER
- SET search_path TO 'public', 'pg_catalog'
-AS $function$
-DECLARE
-  v_company_id uuid;
-  v_filters jsonb;
-  v_event_slugs text[];
-  v_sources text[];
-  v_since_days int;
-  v_consent text;
-  v_uid uuid;
-  v_service boolean;
-BEGIN
-  v_uid := auth.uid();
-  v_service := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role';
-  IF NOT v_service THEN
-    IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
-    IF NOT (public.has_role(v_uid, 'admin'::app_role)
-      OR public.has_role(v_uid, 'marketing_manager'::app_role)) THEN
-      RAISE EXCEPTION 'forbidden';
-    END IF;
-  END IF;
-
-  SELECT a.company_id, a.filters
-    INTO v_company_id, v_filters
-  FROM public.meta_custom_audiences a
-  WHERE a.id = p_audience_id;
-
-  IF v_company_id IS NULL THEN RAISE EXCEPTION 'audience_not_found'; END IF;
-
-  IF NOT v_service AND NOT public.row_belongs_to_current_company(v_company_id) THEN
-    RAISE EXCEPTION 'forbidden';
-  END IF;
-
-  IF v_filters->>'source' = 'newgang_clube:v2' THEN
-    IF v_company_id <> '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'::uuid THEN
-      RAISE EXCEPTION 'source_company_mismatch';
-    END IF;
-    RETURN QUERY
-    SELECT DISTINCT lower(btrim(m.email)) AS email, NULL::text AS phone
-    FROM public.club_members m
-    JOIN public.portal_sites s ON s.id=m.site_id AND s.company_id=m.company_id
-    JOIN public.club_member_profiles p ON p.member_id=m.id AND p.site_id=s.id AND p.company_id=m.company_id
-    JOIN LATERAL (
-      SELECT ev.id,ev.subject_id,ev.company_id,ev.portal,ev.purpose,ev.state,ev.banner_version,ev.revision
-      FROM public.club_member_marketing_consents l JOIN public.marketing_consent_events ev ON ev.id=l.event_id
-      WHERE l.member_id=m.id AND l.site_id=s.id AND l.company_id=m.company_id AND l.purpose='meta_ads'
-        AND ev.subject_id=l.subject_id AND ev.company_id=l.company_id AND ev.portal='newgang' AND ev.purpose='meta_ads'
-      ORDER BY ev.revision DESC,ev.id DESC LIMIT 1
-    ) consent ON true
-    JOIN LATERAL public.marketing_consent_effective(consent.subject_id,statement_timestamp()) effective
-      ON effective.event_id=consent.id AND effective.valid_grant
-    WHERE m.company_id=v_company_id AND s.domain='newgangfestival.pt' AND s.brand_key='newgang' AND s.active
-      AND m.confirmed_at IS NOT NULL
-      AND p.birth_date IS NOT NULL AND isfinite(p.birth_date)
-      AND p.birth_date <= ((statement_timestamp() AT TIME ZONE 'Europe/Lisbon')::date-interval '13 years')::date
-      AND consent.state='granted' AND consent.banner_version='anuncios-v1'
-      AND NOT EXISTS(SELECT 1 FROM public.marketing_consent_events newer WHERE newer.subject_id=consent.subject_id AND newer.revision>consent.revision)
-      AND length(lower(btrim(m.email))) BETWEEN 3 AND 254
-      AND lower(btrim(m.email)) ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
-      AND NOT EXISTS(SELECT 1 FROM public.suppressed_emails se WHERE lower(btrim(se.email))=lower(btrim(m.email))
-        AND (se.company_id IS NULL OR se.company_id=v_company_id));
-    RETURN;
-  END IF;
-
-  IF v_filters->>'source' = 'coala_list:eb2027' THEN
-    IF v_company_id <> '7d831e59-6e82-427b-95a0-64904aae5dd2'::uuid THEN
-      RAISE EXCEPTION 'source_company_mismatch';
-    END IF;
-    RETURN QUERY
-    SELECT m.email, identity_capture.phone
-    FROM (SELECT DISTINCT lower(btrim(cm.email)) AS email
-          FROM public.coala_list_members cm
-          WHERE nullif(btrim(cm.email), '') IS NOT NULL) m
-    LEFT JOIN LATERAL (
-      SELECT c.marketing_opt_in
-      FROM public.coala_list_consents c
-      WHERE c.company_id = v_company_id AND lower(btrim(c.email)) = m.email
-      ORDER BY c.created_at DESC, c.id DESC LIMIT 1
-    ) consent ON true
-    LEFT JOIN LATERAL (
-      SELECT lc.consent_email
-      FROM public.lead_capture lc
-      WHERE lc.company_id = v_company_id AND lower(btrim(lc.email)) = m.email
-      ORDER BY lc.created_at DESC, lc.id DESC LIMIT 1
-    ) latest_capture ON true
-    LEFT JOIN LATERAL (
-      SELECT nullif(btrim(lc.phone), '') AS phone
-      FROM public.lead_capture lc
-      WHERE lc.company_id = v_company_id AND lower(btrim(lc.email)) = m.email
-      ORDER BY (nullif(btrim(lc.phone), '') IS NOT NULL) DESC, lc.created_at DESC, lc.id DESC LIMIT 1
-    ) identity_capture ON true
-    WHERE coalesce(consent.marketing_opt_in, latest_capture.consent_email, false)
-      AND NOT EXISTS (
-        SELECT 1 FROM public.suppressed_emails se
-        WHERE lower(btrim(se.email)) = m.email
-          AND (se.company_id IS NULL OR se.company_id = v_company_id)
-      );
-    RETURN;
-  END IF;
-
-  v_event_slugs := CASE WHEN jsonb_typeof(v_filters->'event_slugs') = 'array'
-    THEN ARRAY(SELECT jsonb_array_elements_text(v_filters->'event_slugs')) ELSE NULL END;
-  v_sources := CASE WHEN jsonb_typeof(v_filters->'sources') = 'array'
-    THEN ARRAY(SELECT jsonb_array_elements_text(v_filters->'sources')) ELSE NULL END;
-  v_since_days := nullif(v_filters->>'since_days','')::int;
-  v_consent := v_filters->>'consent_required';
-
-  RETURN QUERY
-  SELECT DISTINCT lc.email, lc.phone
-  FROM public.lead_capture lc
-  JOIN public.events e ON e.slug = lc.event_slug
-  WHERE e.company_id = v_company_id
-    AND (lc.email IS NOT NULL OR lc.phone IS NOT NULL)
-    AND (v_event_slugs IS NULL OR array_length(v_event_slugs,1) IS NULL OR lc.event_slug = ANY(v_event_slugs))
-    AND (v_sources IS NULL OR array_length(v_sources,1) IS NULL OR lc.source = ANY(v_sources))
-    AND (v_since_days IS NULL OR lc.created_at >= now() - (v_since_days || ' days')::interval)
-    AND (
-      v_consent IS NULL OR v_consent = ''
-      OR (v_consent = 'email' AND lc.consent_email = true)
-      OR (v_consent = 'whatsapp' AND lc.consent_whatsapp = true)
-      OR (v_consent = 'any' AND (lc.consent_email = true OR lc.consent_whatsapp = true))
-    );
-END;
-$function$
-
```

## club_profile_state

```diff
--- antes
+++ depois
@@ -1,20 +0,0 @@
-CREATE OR REPLACE FUNCTION public.club_profile_state(p_site uuid, p_session_hash text)
- RETURNS jsonb
- LANGUAGE plpgsql
- STABLE SECURITY DEFINER
- SET search_path TO 'public'
-AS $function$
-DECLARE m record; p club_member_profiles; s club_profile_settings; n int; BEGIN
- SELECT cm.* INTO m FROM club_member_sessions x JOIN club_members cm ON cm.id=x.member_id
- JOIN portal_sites ps ON ps.id=cm.site_id AND ps.company_id=cm.company_id
- WHERE x.site_id=p_site AND cm.site_id=p_site AND x.token_hash=p_session_hash AND x.purpose='access' AND x.expires_at>statement_timestamp() AND cm.confirmed_at IS NOT NULL AND ps.active AND ps.brand_key='newgang';
- IF NOT FOUND THEN RAISE EXCEPTION 'no_session'; END IF;
- SELECT * INTO p FROM club_member_profiles WHERE member_id=m.id;
- SELECT * INTO s FROM club_profile_settings WHERE site_id=p_site;
- SELECT coalesce(sum(points),0)::int INTO n FROM club_points WHERE member_id=m.id AND (rule_key='profile_complete' OR (rule_key='void' AND ref_id='profile_complete:'||m.id::text));
- RETURN jsonb_build_object('birth_date',p.birth_date,'birth_country',p.birth_country,'residence_country',p.residence_country,'city',p.city,'phone',m.phone,
-  'complete',p.birth_date IS NOT NULL AND p.birth_country IS NOT NULL AND p.residence_country IS NOT NULL AND (p.residence_country IS DISTINCT FROM 'PT' OR p.city IS NOT NULL),
-  'completed_at',p.completed_at,'reward_claimed',p.completed_at IS NOT NULL,'eligible',coalesce(s.enabled,false) AND p.completed_at IS NULL,
-  'available',coalesce(s.enabled,false),'points',n,'reward_points',50,'version',s.version,'scope','adesao','whatsapp',jsonb_build_object('status','adapter_pending','editable',false));
-END $function$
-
```

## crm_ingest_lead_captures

```diff
--- antes
+++ depois
@@ -1,170 +0,0 @@
-CREATE OR REPLACE FUNCTION public.crm_ingest_lead_captures(p_batch_size integer DEFAULT 100, p_only_ids uuid[] DEFAULT NULL::uuid[])
- RETURNS jsonb
- LANGUAGE plpgsql
- SECURITY DEFINER
- SET search_path TO 'public', 'pg_temp'
-AS $function$
-DECLARE
-  MP_CO    constant uuid := '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
-  COALA_CO constant uuid := '7d831e59-6e82-427b-95a0-64904aae5dd2';
-  MP_SOURCES constant text[] := ARRAY['portal','vip_event_page','sticky_cta','notify_me',
-    'hero_vip','newsletter_homepage','vip_hero_coupon_chip',
-    'clube_newgang'];
-  COALA_SOURCES constant text[] := ARRAY['coala_hero_email','coala_early_bird',
-    'coala_early_bird_invite','notify_me'];
-  Q_SCOPE constant text := 'quarantine#321: empresa/origem fora do âmbito da ingestão interna';
-  lc record;
-  v_email text; v_phone text;
-  v_by_email uuid; v_by_phone uuid; v_contact_id uuid;
-  v_event_id uuid; v_lead_id uuid;
-  n_ok int := 0; n_contacts_new int := 0; n_leads_new int := 0;
-  n_invite int := 0; n_quarantine int := 0; n_error int := 0;
-  n_club int := 0; n_club_deferred int := 0; d_c int; d_l int; v_club_seen text[] := ARRAY[]::text[];
-BEGIN
-  WITH oos AS (
-    SELECT id FROM public.lead_capture
-    WHERE processed = false
-      AND (p_only_ids IS NULL OR id = ANY(p_only_ids))
-      AND processing_error IS DISTINCT FROM Q_SCOPE
-      AND (company_id IS NULL
-           OR NOT ((company_id = MP_CO AND source = ANY(MP_SOURCES))
-                OR (company_id = COALA_CO AND source = ANY(COALA_SOURCES))))
-    LIMIT 1000 FOR UPDATE SKIP LOCKED)
-  UPDATE public.lead_capture l SET processing_error = Q_SCOPE FROM oos WHERE l.id = oos.id;
-  GET DIAGNOSTICS n_quarantine = ROW_COUNT;
-
-  FOR lc IN
-    SELECT * FROM public.lead_capture
-    WHERE processed = false
-      AND (p_only_ids IS NULL OR id = ANY(p_only_ids))
-      AND company_id IS NOT NULL
-      AND ((company_id = MP_CO AND source = ANY(MP_SOURCES))
-        OR (company_id = COALA_CO AND source = ANY(COALA_SOURCES)))
-    ORDER BY (processing_error IS NOT NULL), created_at ASC, id ASC
-    LIMIT GREATEST(p_batch_size, 1)
-    FOR UPDATE SKIP LOCKED
-  LOOP
-    IF lc.source = 'clube_newgang' AND NOT EXISTS (SELECT 1 FROM public.portal_sites
-         WHERE brand_key = 'newgang' AND active AND company_id = lc.company_id) THEN
-      UPDATE public.lead_capture SET processing_error = 'quarantine#321: clube sem site Newgang activo' WHERE id = lc.id;
-      n_quarantine := n_quarantine + 1; CONTINUE;
-    END IF;
-    IF lc.source = 'clube_newgang' AND NULLIF(btrim(coalesce(lc.email,'')),'') IS NULL THEN
-      UPDATE public.lead_capture SET processing_error = 'quarantine#321: clube sem email' WHERE id = lc.id;
-      n_quarantine := n_quarantine + 1; CONTINUE;
-    END IF;
-    IF lc.source = 'clube_newgang' THEN
-      IF lower(btrim(lc.email)) = ANY(v_club_seen) THEN
-        n_club_deferred := n_club_deferred + 1; CONTINUE;
-      END IF;
-      v_club_seen := v_club_seen || lower(btrim(lc.email));
-    END IF;
-
-    v_email := NULLIF(lower(btrim(coalesce(lc.email, ''))), '');
-    v_phone := NULLIF(btrim(coalesce(lc.phone, '')), '');
-    IF v_email IS NULL AND v_phone IS NULL THEN
-      UPDATE public.lead_capture SET processing_error = 'quarantine#321: sem email nem telefone'
-       WHERE id = lc.id;
-      n_quarantine := n_quarantine + 1;
-      CONTINUE;
-    END IF;
-
-    d_c := 0; d_l := 0;
-    BEGIN
-      IF v_email IS NOT NULL THEN
-        PERFORM pg_advisory_xact_lock(hashtextextended('crm321:e:'||lc.company_id||':'||v_email, 0));
-      END IF;
-      IF v_phone IS NOT NULL THEN
-        PERFORM pg_advisory_xact_lock(hashtextextended('crm321:p:'||lc.company_id||':'||v_phone, 0));
-      END IF;
-
-      v_by_email := NULL; v_by_phone := NULL;
-      IF v_email IS NOT NULL THEN
-        SELECT id INTO v_by_email FROM public.contacts
-         WHERE company_id = lc.company_id AND lower(btrim(email)) = v_email LIMIT 1;
-      END IF;
-      IF v_phone IS NOT NULL THEN
-        SELECT id INTO v_by_phone FROM public.contacts
-         WHERE company_id = lc.company_id AND phone_e164 = v_phone LIMIT 1;
-      END IF;
-
-      IF v_by_email IS NOT NULL AND v_by_phone IS NOT NULL AND v_by_email <> v_by_phone THEN
-        RAISE EXCEPTION 'quarantine#321: email e telefone pertencem a contactos diferentes';
-      END IF;
-      v_contact_id := coalesce(v_by_email, v_by_phone);
-
-      IF v_contact_id IS NOT NULL THEN
-        UPDATE public.contacts SET
-          email = coalesce(email, CASE WHEN v_by_email IS NULL THEN v_email END),
-          phone_e164 = coalesce(phone_e164, CASE WHEN v_by_phone IS NULL THEN v_phone END),
-          name = coalesce(name, NULLIF(btrim(lc.name), '')),
-          last_activity_at = greatest(last_activity_at, lc.created_at),
-          updated_at = now()
-        WHERE id = v_contact_id;
-      ELSE
-        INSERT INTO public.contacts (company_id, email, phone_e164, name,
-          consent_email, consent_whatsapp, consent_email_at, consent_whatsapp_at,
-          source, first_seen_at, last_activity_at)
-        VALUES (lc.company_id, v_email, v_phone, NULLIF(btrim(lc.name), ''),
-          coalesce(lc.consent_email, false), coalesce(lc.consent_whatsapp, false),
-          CASE WHEN coalesce(lc.consent_email, false) THEN lc.created_at END,
-          CASE WHEN coalesce(lc.consent_whatsapp, false) THEN lc.created_at END,
-          lc.source, lc.created_at, lc.created_at)
-        RETURNING id INTO v_contact_id;
-        d_c := 1;
-      END IF;
-
-      IF lc.source <> 'coala_early_bird_invite' THEN
-        v_lead_id := NULL;
-        SELECT id INTO v_lead_id FROM public.leads
-         WHERE company_id = lc.company_id AND meta->>'lead_capture_id' = lc.id::text LIMIT 1;
-        IF v_lead_id IS NULL THEN
-          v_event_id := NULL;
-          IF lc.event_slug IS NOT NULL THEN
-            SELECT id INTO v_event_id FROM public.events
-             WHERE company_id = lc.company_id AND slug = lc.event_slug LIMIT 1;
-          END IF;
-          INSERT INTO public.leads (company_id, contact_id, event_id, kind, source,
-            utm_source, utm_medium, utm_campaign, utm_content,
-            ip_inet, user_agent, fbc, fbp, geo_country, geo_city, geo_region,
-            created_at, meta, capi_status, capi_block_reason, capi_classified_at)
-          VALUES (lc.company_id, v_contact_id, v_event_id,
-            CASE WHEN lc.event_slug IS NOT NULL THEN 'event_interest' ELSE 'newsletter_signup' END,
-            lc.source, lc.utm_source, lc.utm_medium, lc.utm_campaign, lc.utm_content,
-            lc.ip_inet, lc.user_agent, lc.fbc, lc.fbp, lc.geo_country, lc.geo_city, lc.geo_region,
-            lc.created_at,
-            jsonb_build_object('lead_capture_id', lc.id, 'ingested_by', 'crm_ingest_lead_captures', 'issue', 321),
-            'blocked_no_consent',
-            'ingestão interna #321 — sem prova de consentimento marketing por interacção; não elegível CAPI',
-            now())
-          RETURNING id INTO v_lead_id;
-          d_l := 1;
-        END IF;
-      END IF;
-
-      UPDATE public.lead_capture
-         SET processed = true, processed_at = now(), processing_error = NULL
-       WHERE id = lc.id;
-      IF lc.source = 'clube_newgang' AND NOT EXISTS (SELECT 1 FROM public.club_members cm
-           JOIN public.portal_sites ps ON ps.id = cm.site_id AND ps.brand_key = 'newgang' AND ps.company_id = lc.company_id
-           WHERE lower(btrim(cm.email)) = v_email) THEN
-        RAISE EXCEPTION 'clube#321: membro não criado pelo trigger do Clube';
-      END IF;
-      n_contacts_new := n_contacts_new + d_c; n_leads_new := n_leads_new + d_l;
-      IF lc.source = 'coala_early_bird_invite' THEN n_invite := n_invite + 1; END IF;
-      n_ok := n_ok + 1;
-      IF lc.source = 'clube_newgang' THEN n_club := n_club + 1; END IF;
-    EXCEPTION WHEN OTHERS THEN
-      UPDATE public.lead_capture SET processing_error = left(SQLERRM, 500) WHERE id = lc.id;
-      IF SQLERRM LIKE 'quarantine#321:%' THEN n_quarantine := n_quarantine + 1;
-      ELSE n_error := n_error + 1; END IF;
-    END;
-  END LOOP;
-
-  RETURN jsonb_build_object('processed', n_ok, 'contacts_new', n_contacts_new,
-    'leads_new', n_leads_new, 'invite_no_interaction', n_invite,
-    'quarantine', n_quarantine, 'errors', n_error,
-    'clube_processed', n_club, 'clube_deferred_same_email', n_club_deferred);
-END
-$function$
-
```

## club_from_lead_capture

```diff
--- antes
+++ depois
@@ -1,60 +0,0 @@
-CREATE OR REPLACE FUNCTION public.club_from_lead_capture()
- RETURNS trigger
- LANGUAGE plpgsql
- SECURITY DEFINER
- SET search_path TO 'public'
-AS $function$
-DECLARE s uuid; c uuid; mid uuid; is_new boolean; cc text; j jsonb; st text; BEGIN
-  IF NEW.source IS DISTINCT FROM 'clube_newgang' OR NEW.email IS NULL THEN RETURN NEW; END IF;
-  SELECT id INTO s FROM portal_sites WHERE brand_key = 'newgang' AND active AND company_id = NEW.company_id ORDER BY created_at LIMIT 1;
-  IF s IS NULL THEN RETURN NEW; END IF;
-  SELECT id INTO c FROM contacts WHERE lower(trim(email)) = lower(trim(NEW.email)) AND company_id = NEW.company_id LIMIT 1;
-  mid := club_upsert_member(s, NEW.email, split_part(coalesce(NEW.name,''),' ',1), NEW.phone, c, NEW.raw->>'referral_code', 'formulario');
-  IF mid IS NOT NULL AND NEW.raw ? 'terms_version' THEN
-    PERFORM club_record_terms(mid, NEW.raw->>'terms_version', NEW.created_at);
-  END IF;
-  IF mid IS NOT NULL AND coalesce(NEW.raw->>'crew_code','') <> '' THEN
-    BEGIN
-      cc := upper(trim(NEW.raw->>'crew_code'));
-      IF cc !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6,7}$' THEN
-        RAISE WARNING 'club_from_lead_capture crew_code inválido';
-        cc := left(regexp_replace(cc, '[^A-Z0-9]', '', 'g'), 7);
-        IF cc <> '' THEN
-          UPDATE club_members SET pending_crew_code = cc, pending_crew_status = 'crew_not_found', pending_crew_checked_at = now() WHERE id = mid;
-        END IF;
-      ELSIF EXISTS (SELECT 1 FROM club_members WHERE id = mid AND confirmed_at IS NOT NULL) THEN
-        BEGIN
-          j := club_crew_join(mid, cc);
-          st := j->>'error';
-        EXCEPTION WHEN OTHERS THEN RAISE WARNING 'club_from_lead_capture crew join: %', SQLERRM; st := 'error'; END;
-        IF st IS NULL OR (st = 'already_in_crew' AND EXISTS (SELECT 1 FROM club_crew_members cm JOIN club_crews k ON k.id = cm.crew_id WHERE cm.member_id = mid AND k.code = cc)) THEN
-          UPDATE club_members SET pending_crew_code = NULL, pending_crew_status = NULL, pending_crew_checked_at = NULL WHERE id = mid;
-        ELSE
-          UPDATE club_members SET pending_crew_code = cc,
-            pending_crew_status = CASE WHEN st IN ('crew_full','crew_not_found','already_in_crew') THEN st ELSE 'error' END,
-            pending_crew_checked_at = now() WHERE id = mid;
-        END IF;
-      ELSE
-        UPDATE club_members SET pending_crew_code = cc, pending_crew_status = NULL, pending_crew_checked_at = NULL WHERE id = mid;
-      END IF;
-    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'club_from_lead_capture crew: %', SQLERRM; END;
-  END IF;
-  IF mid IS NOT NULL THEN
-    BEGIN
-      SELECT (source = 'formulario' AND confirmed_at IS NULL AND created_at > now() - interval '1 minute')
-        INTO is_new FROM club_members WHERE id = mid;
-      IF is_new THEN
-        PERFORM net.http_post(
-          url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/newgang-portal',
-          headers := jsonb_build_object('Content-Type','application/json'),
-          body := jsonb_build_object('action','notify_member','member_id',mid));
-      END IF;
-    EXCEPTION WHEN OTHERS THEN
-      RAISE WARNING 'club_from_lead_capture notify: %', SQLERRM;
-    END;
-  END IF;
-  RETURN NEW;
-EXCEPTION WHEN OTHERS THEN
-  RAISE WARNING 'club_from_lead_capture: %', SQLERRM; RETURN NEW;
-END $function$
-
```
