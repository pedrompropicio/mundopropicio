# #314 Fase 1 — diff das funções (antes = Live 26/10/2026 ~20:20 UTC; depois = Live após 0266, pg_get_functiondef)

Atributos (prosecdef, proconfig, proacl) iguais antes/depois em todas — ver fase1.md. Inalteradas de propósito: _crm_whatsapp_project e _crm_whatsapp_contact_guard (só escrevem a etiqueta de origem 'club_profile_whatsapp-v1'; não comparam versões).

## _club332_email_append

```diff
--- antes
+++ depois
@@ -4,15 +4,15 @@
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
 AS $function$
-DECLARE old public.club_member_email_consents; co uuid;
+DECLARE old public.club_member_email_consents; co uuid; v_ver text := coalesce(nullif(current_setting('club314.consent_version',true),''),'email-v3');
 BEGIN
- IF p_decision IS NULL OR p_decision NOT IN ('granted','revoked') OR p_key IS NULL THEN RAISE EXCEPTION 'consent_payload'; END IF;
+ IF p_decision IS NULL OR p_decision NOT IN ('granted','revoked') OR p_key IS NULL OR v_ver NOT IN ('email-v3','email-v4') THEN RAISE EXCEPTION 'consent_payload'; END IF;
  SELECT company_id INTO co FROM public.club_members WHERE id=p_member AND site_id=p_site;
  IF co IS NULL THEN RAISE EXCEPTION 'consent_scope'; END IF;
  SELECT * INTO old FROM public.club_member_email_consents WHERE member_id=p_member AND site_id=p_site AND idempotency_key=p_key;
  IF FOUND THEN IF old.decision<>p_decision OR old.origin<>p_origin THEN RAISE EXCEPTION 'idempotency_conflict'; END IF; RETURN; END IF;
- IF p_decision='granted' AND NOT EXISTS (SELECT 1 FROM public.consent_text_versions v WHERE v.company_id=co AND v.version='email-v3' AND v.channel='email' AND v.locale='pt' AND v.valid_from<=clock_timestamp() AND (v.valid_to IS NULL OR v.valid_to>clock_timestamp())) THEN RAISE EXCEPTION 'consent_text_unregistered'; END IF;
- INSERT INTO public.club_member_email_consents(member_id,site_id,company_id,version,decision,origin,idempotency_key) VALUES(p_member,p_site,co,'email-v3',p_decision,p_origin,p_key);
+ IF p_decision='granted' AND NOT EXISTS (SELECT 1 FROM public.consent_text_versions v WHERE v.company_id=co AND v.version=v_ver AND v.channel='email' AND v.locale='pt' AND v.valid_from<=clock_timestamp() AND (v.valid_to IS NULL OR v.valid_to>clock_timestamp())) THEN RAISE EXCEPTION 'consent_text_unregistered'; END IF;
+ INSERT INTO public.club_member_email_consents(member_id,site_id,company_id,version,decision,origin,idempotency_key) VALUES(p_member,p_site,co,v_ver,p_decision,p_origin,p_key);
 END
 $function$
 
```

## _club332_ads_append

```diff
--- antes
+++ depois
@@ -4,16 +4,16 @@
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
 AS $function$
-DECLARE co uuid; purpose_name text; sub uuid; eid bigint; rev bigint; policy text; payload jsonb; prior jsonb; sorted text[];
+DECLARE co uuid; purpose_name text; sub uuid; eid bigint; rev bigint; policy text; payload jsonb; prior jsonb; sorted text[]; v_ver text := coalesce(nullif(current_setting('club314.consent_version',true),''),'anuncios-v1');
 BEGIN
- IF p_decision IS NULL OR p_decision NOT IN ('granted','revoked') OR p_key IS NULL OR p_purposes IS NULL OR cardinality(p_purposes) NOT BETWEEN 1 AND 3 OR EXISTS(SELECT 1 FROM unnest(p_purposes) p WHERE p IS NULL OR p NOT IN ('meta_ads','tiktok_ads','google_ads')) OR cardinality(p_purposes)<>(SELECT count(DISTINCT p) FROM unnest(p_purposes) p) THEN RAISE EXCEPTION 'consent_payload'; END IF;
+ IF p_decision IS NULL OR p_decision NOT IN ('granted','revoked') OR p_key IS NULL OR v_ver NOT IN ('anuncios-v1','anuncios-v2') OR p_purposes IS NULL OR cardinality(p_purposes) NOT BETWEEN 1 AND 3 OR EXISTS(SELECT 1 FROM unnest(p_purposes) p WHERE p IS NULL OR p NOT IN ('meta_ads','tiktok_ads','google_ads')) OR cardinality(p_purposes)<>(SELECT count(DISTINCT p) FROM unnest(p_purposes) p) THEN RAISE EXCEPTION 'consent_payload'; END IF;
  SELECT array_agg(p ORDER BY p) INTO sorted FROM unnest(p_purposes) p;
- payload:=jsonb_build_object('decision',p_decision,'purposes',sorted,'version','anuncios-v1','origin',p_origin);
+ payload:=jsonb_build_object('decision',p_decision,'purposes',sorted,'version',v_ver,'origin',p_origin);
  SELECT request_payload INTO prior FROM public.club_member_marketing_consents WHERE member_id=p_member AND site_id=p_site AND request_key=p_key LIMIT 1;
  IF FOUND THEN IF prior<>payload THEN RAISE EXCEPTION 'idempotency_conflict'; END IF; RETURN; END IF;
  SELECT company_id INTO co FROM public.club_members WHERE id=p_member AND site_id=p_site;
  IF co IS NULL THEN RAISE EXCEPTION 'consent_scope'; END IF;
- IF p_decision='granted' AND NOT EXISTS (SELECT 1 FROM public.consent_text_versions v WHERE v.company_id=co AND v.version='anuncios-v1' AND v.channel='ads' AND v.locale='pt' AND v.valid_from<=clock_timestamp() AND (v.valid_to IS NULL OR v.valid_to>clock_timestamp())) THEN RAISE EXCEPTION 'consent_text_unregistered'; END IF;
+ IF p_decision='granted' AND NOT EXISTS (SELECT 1 FROM public.consent_text_versions v WHERE v.company_id=co AND v.version=v_ver AND v.channel='ads' AND v.locale='pt' AND v.valid_from<=clock_timestamp() AND (v.valid_to IS NULL OR v.valid_to>clock_timestamp())) THEN RAISE EXCEPTION 'consent_text_unregistered'; END IF;
  SELECT policy_version INTO policy FROM public.marketing_consent_policies WHERE portal='newgang' AND valid_from<=clock_timestamp() AND (valid_to IS NULL OR valid_to>clock_timestamp()) ORDER BY valid_from DESC LIMIT 1;
  IF policy IS NULL AND p_decision='granted' THEN RAISE EXCEPTION 'consent_policy_unavailable'; END IF;
  policy:=coalesce(policy,'revoked');
@@ -22,7 +22,7 @@
  IF sub IS NULL THEN INSERT INTO public.marketing_consent_subjects(company_id,portal,token_hash) VALUES(co,'newgang',encode(extensions.digest(extensions.gen_random_bytes(32),'sha256'),'hex')) RETURNING id INTO sub; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('mcs:'||sub::text,0));
  SELECT coalesce(max(revision),0)+1 INTO rev FROM public.marketing_consent_events WHERE subject_id=sub;
- INSERT INTO public.marketing_consent_events(subject_id,company_id,portal,state,purpose,policy_version,banner_version,client_seq,idempotency_key,origin,path,revision,expected_revision) VALUES(sub,co,'newgang',p_decision,purpose_name,policy,'anuncios-v1',rev,p_key,p_origin,'/clube/perfil',rev,rev-1) RETURNING id INTO eid;
+ INSERT INTO public.marketing_consent_events(subject_id,company_id,portal,state,purpose,policy_version,banner_version,client_seq,idempotency_key,origin,path,revision,expected_revision) VALUES(sub,co,'newgang',p_decision,purpose_name,policy,v_ver,rev,p_key,p_origin,'/clube/perfil',rev,rev-1) RETURNING id INTO eid;
  INSERT INTO public.club_member_marketing_consents(event_id,member_id,site_id,company_id,subject_id,purpose,request_key,request_payload) VALUES(eid,p_member,p_site,co,sub,purpose_name,p_key,payload);
  END LOOP;
 END
```

## _club332_whatsapp_append

```diff
--- antes
+++ depois
@@ -4,20 +4,20 @@
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_catalog'
 AS $function$
-DECLARE old public.club_member_whatsapp_consents; co uuid; ph text; fp text;
+DECLARE old public.club_member_whatsapp_consents; co uuid; ph text; fp text; v_ver text := coalesce(nullif(current_setting('club314.consent_version',true),''),'whatsapp-v1');
 BEGIN
- IF p_decision IS NULL OR p_decision NOT IN ('granted','revoked') OR p_key IS NULL THEN RAISE EXCEPTION 'consent_payload'; END IF;
+ IF p_decision IS NULL OR p_decision NOT IN ('granted','revoked') OR p_key IS NULL OR v_ver NOT IN ('whatsapp-v1','whatsapp-v2') THEN RAISE EXCEPTION 'consent_payload'; END IF;
  SELECT company_id, phone INTO co, ph FROM public.club_members WHERE id=p_member AND site_id=p_site;
  IF co IS NULL THEN RAISE EXCEPTION 'consent_scope'; END IF;
  SELECT * INTO old FROM public.club_member_whatsapp_consents WHERE member_id=p_member AND site_id=p_site AND idempotency_key=p_key;
  IF FOUND THEN IF old.decision<>p_decision OR old.origin<>p_origin THEN RAISE EXCEPTION 'idempotency_conflict'; END IF; RETURN; END IF;
  IF p_decision='granted' THEN
    IF ph IS NULL OR ph !~ '^\+[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'whatsapp_no_phone'; END IF;
-   IF NOT EXISTS (SELECT 1 FROM public.consent_text_versions v WHERE v.company_id=co AND v.version='whatsapp-v1' AND v.channel='whatsapp' AND v.locale='pt' AND v.valid_from<=clock_timestamp() AND (v.valid_to IS NULL OR v.valid_to>clock_timestamp())) THEN RAISE EXCEPTION 'consent_text_unregistered'; END IF;
+   IF NOT EXISTS (SELECT 1 FROM public.consent_text_versions v WHERE v.company_id=co AND v.version=v_ver AND v.channel='whatsapp' AND v.locale='pt' AND v.valid_from<=clock_timestamp() AND (v.valid_to IS NULL OR v.valid_to>clock_timestamp())) THEN RAISE EXCEPTION 'consent_text_unregistered'; END IF;
  END IF;
  fp:=public._club332_whatsapp_fp(ph);
  INSERT INTO public.club_member_whatsapp_consents(member_id,site_id,company_id,version,decision,origin,phone_fp,idempotency_key)
- VALUES(p_member,p_site,co,'whatsapp-v1',p_decision,p_origin,fp,p_key);
+ VALUES(p_member,p_site,co,v_ver,p_decision,p_origin,fp,p_key);
 END
 $function$
 
```

## _club332_consent_from_lead_capture

```diff
--- antes
+++ depois
@@ -8,8 +8,9 @@
 BEGIN
   IF NEW.source IS DISTINCT FROM 'clube_newgang' OR NEW.email IS NULL THEN RETURN NEW; END IF;
   IF coalesce(NEW.consent_email,false) <> true THEN RETURN NEW; END IF;
+  IF NEW.processing_error IS NOT DISTINCT FROM 'under13_blocked' THEN RETURN NEW; END IF;
   v_version := NEW.raw->>'consent_text_version';
-  IF v_version IS DISTINCT FROM 'email-v3' THEN RETURN NEW; END IF;
+  IF v_version IS NULL OR v_version NOT IN ('email-v3','email-v4') THEN RETURN NEW; END IF;
   SELECT id, company_id INTO s_id, s_co FROM public.portal_sites
    WHERE brand_key='newgang' AND active AND company_id=NEW.company_id ORDER BY created_at LIMIT 1;
   IF s_id IS NULL THEN RETURN NEW; END IF;
@@ -20,7 +21,7 @@
   v_key := regexp_replace(md5('lc332:'||NEW.id::text),'(.{8})(.{4})(.{4})(.{4})(.{12})','\1-\2-\3-\4-\5')::uuid;
   BEGIN
     INSERT INTO public.club_member_email_consents(member_id,site_id,company_id,version,decision,decided_at,origin,idempotency_key)
-    VALUES(mid,s_id,s_co,'email-v3','granted',NEW.created_at,'signup',v_key);
+    VALUES(mid,s_id,s_co,v_version,'granted',NEW.created_at,'signup',v_key);
   EXCEPTION WHEN unique_violation THEN NULL;
   END;
   RETURN NEW;
```

## _club368_resubscribe_clear

```diff
--- antes
+++ depois
@@ -6,7 +6,7 @@
 AS $function$
 DECLARE m public.club_members; h text; n int;
 BEGIN
- IF NEW.decision <> 'granted' OR NEW.origin <> 'signup' OR NEW.version <> 'email-v3' THEN RETURN NULL; END IF;
+ IF NEW.decision <> 'granted' OR NEW.origin <> 'signup' OR NEW.version NOT IN ('email-v3','email-v4') THEN RETURN NULL; END IF;
  SELECT * INTO m FROM public.club_members WHERE id = NEW.member_id;
  IF NOT FOUND OR m.erased_at IS NOT NULL OR m.email IS NULL THEN RETURN NULL; END IF;
  h := encode(sha256(convert_to(lower(btrim(m.email)),'UTF8')),'hex');
```

## _club332_history_guard

```diff
--- antes
+++ depois
@@ -11,7 +11,7 @@
  IF NOT FOUND THEN RAISE EXCEPTION 'consent_scope'; END IF;
  IF TG_TABLE_NAME='club_member_marketing_consents' THEN
  SELECT * INTO e FROM public.marketing_consent_events WHERE id=NEW.event_id;
- IF e.subject_id IS DISTINCT FROM NEW.subject_id OR e.company_id IS DISTINCT FROM NEW.company_id OR e.portal IS DISTINCT FROM 'newgang' OR e.purpose IS DISTINCT FROM NEW.purpose OR e.banner_version IS DISTINCT FROM 'anuncios-v1' OR e.idempotency_key IS DISTINCT FROM NEW.request_key OR e.state IS DISTINCT FROM NEW.request_payload->>'decision' OR NOT EXISTS(SELECT 1 FROM public.marketing_consent_subjects s WHERE s.id=NEW.subject_id AND s.company_id=NEW.company_id AND s.portal='newgang') THEN RAISE EXCEPTION 'consent_scope'; END IF;
+ IF e.subject_id IS DISTINCT FROM NEW.subject_id OR e.company_id IS DISTINCT FROM NEW.company_id OR e.portal IS DISTINCT FROM 'newgang' OR e.purpose IS DISTINCT FROM NEW.purpose OR e.banner_version IS NULL OR e.banner_version NOT IN ('anuncios-v1','anuncios-v2') OR e.idempotency_key IS DISTINCT FROM NEW.request_key OR e.state IS DISTINCT FROM NEW.request_payload->>'decision' OR NOT EXISTS(SELECT 1 FROM public.marketing_consent_subjects s WHERE s.id=NEW.subject_id AND s.company_id=NEW.company_id AND s.portal='newgang') THEN RAISE EXCEPTION 'consent_scope'; END IF;
  IF EXISTS(SELECT 1 FROM public.club_member_marketing_consents l WHERE l.subject_id=NEW.subject_id AND (l.member_id<>NEW.member_id OR l.site_id<>NEW.site_id OR l.purpose<>NEW.purpose)) THEN RAISE EXCEPTION 'consent_scope'; END IF;
  END IF;
  RETURN NEW;
```

## club_marketing_binding_valid

```diff
--- antes
+++ depois
@@ -4,6 +4,6 @@
  STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
 AS $function$
- SELECT coalesce(EXISTS(SELECT 1 FROM public.club_member_marketing_consents l JOIN public.marketing_consent_events e ON e.id=l.event_id WHERE l.member_id=p_member AND l.site_id=p_site AND l.purpose=p_purpose AND e.id=p_event AND e.state='granted' AND e.server_received_at<=p_captured_at AND e.banner_version='anuncios-v1' AND NOT EXISTS(SELECT 1 FROM public.marketing_consent_events n WHERE n.subject_id=e.subject_id AND n.revision>e.revision) AND EXISTS(SELECT 1 FROM public.marketing_consent_effective(e.subject_id,p_captured_at) f WHERE f.event_id=e.id AND f.valid_grant) AND EXISTS(SELECT 1 FROM public.marketing_consent_effective(e.subject_id,clock_timestamp()) f WHERE f.event_id=e.id AND f.valid_grant)),false);
+ SELECT coalesce(EXISTS(SELECT 1 FROM public.club_member_marketing_consents l JOIN public.marketing_consent_events e ON e.id=l.event_id WHERE l.member_id=p_member AND l.site_id=p_site AND l.purpose=p_purpose AND e.id=p_event AND e.state='granted' AND e.server_received_at<=p_captured_at AND e.banner_version IN ('anuncios-v1','anuncios-v2') AND NOT EXISTS(SELECT 1 FROM public.marketing_consent_events n WHERE n.subject_id=e.subject_id AND n.revision>e.revision) AND EXISTS(SELECT 1 FROM public.marketing_consent_effective(e.subject_id,p_captured_at) f WHERE f.event_id=e.id AND f.valid_grant) AND EXISTS(SELECT 1 FROM public.marketing_consent_effective(e.subject_id,clock_timestamp()) f WHERE f.event_id=e.id AND f.valid_grant)),false);
 $function$
 
```

## club_profile_preferences

```diff
--- antes
+++ depois
@@ -15,24 +15,24 @@
  PERFORM 1 FROM public.club_members WHERE id=m FOR NO KEY UPDATE;
  again:=public._club332_session(p_site,p_session_hash);
  IF again<>m THEN RAISE EXCEPTION 'no_session'; END IF;
- IF decision='granted' THEN SELECT birth_date INTO bd FROM public.club_member_profiles WHERE member_id=m AND site_id=p_site; IF bd IS NULL OR bd>((clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date-interval '13 years')::date THEN RAISE EXCEPTION 'parental_flow_required'; END IF; END IF;
+ IF decision='granted' THEN SELECT birth_date INTO bd FROM public.club_member_profiles WHERE member_id=m AND site_id=p_site; IF public.club_age_class(bd) IN ('under13','unknown') THEN RAISE EXCEPTION 'parental_flow_required'; END IF; END IF;
  IF p_payload->>'channel'='email' THEN
-  IF p_payload->>'version' IS DISTINCT FROM 'email-v3' OR p_payload ? 'platforms' THEN RAISE EXCEPTION 'consent_payload'; END IF;
+  IF p_payload->>'version' IS NULL OR p_payload->>'version' NOT IN ('email-v3','email-v4') OR p_payload ? 'platforms' THEN RAISE EXCEPTION 'consent_payload'; END IF;
   SELECT EXISTS(SELECT 1 FROM public.club_member_email_consents WHERE member_id=m AND site_id=p_site AND idempotency_key=v_key) INTO prior_key;
   IF decision='granted' AND NOT prior_key THEN current_state:=public._club332_state(m,p_site); expected:=p_payload->'expected_dates'; IF jsonb_typeof(expected) IS DISTINCT FROM 'object' OR NOT expected ? 'email' OR expected->'email' IS DISTINCT FROM current_state#>'{email,date}' THEN RAISE EXCEPTION 'consent_revision_conflict'; END IF; END IF;
-  PERFORM public._club332_email_append(m,p_site,decision,v_key,'club_session');
+  PERFORM set_config('club314.consent_version',p_payload->>'version',true); PERFORM public._club332_email_append(m,p_site,decision,v_key,'club_session'); PERFORM set_config('club314.consent_version','',true);
  ELSIF p_payload->>'channel'='ads' THEN
-  IF p_payload->>'version' IS DISTINCT FROM 'anuncios-v1' OR jsonb_typeof(p_payload->'platforms') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'platforms') v WHERE jsonb_typeof(v)<>'string') THEN RAISE EXCEPTION 'consent_payload'; END IF;
+  IF p_payload->>'version' IS NULL OR p_payload->>'version' NOT IN ('anuncios-v1','anuncios-v2') OR jsonb_typeof(p_payload->'platforms') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'platforms') v WHERE jsonb_typeof(v)<>'string') THEN RAISE EXCEPTION 'consent_payload'; END IF;
   SELECT array_agg(v) INTO purposes FROM jsonb_array_elements_text(p_payload->'platforms') v;
   IF cardinality(purposes) IS NULL OR cardinality(purposes) NOT BETWEEN 1 AND 3 OR EXISTS(SELECT 1 FROM unnest(purposes) p WHERE p NOT IN ('meta_ads','tiktok_ads','google_ads')) OR cardinality(purposes)<>(SELECT count(DISTINCT p) FROM unnest(purposes) p) THEN RAISE EXCEPTION 'consent_payload'; END IF;
   SELECT EXISTS(SELECT 1 FROM public.club_member_marketing_consents WHERE member_id=m AND site_id=p_site AND request_key=v_key) INTO prior_key;
   IF decision='granted' AND NOT prior_key THEN current_state:=public._club332_state(m,p_site); expected:=p_payload->'expected_dates'; IF jsonb_typeof(expected) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'consent_revision_conflict'; END IF; FOREACH purpose_name IN ARRAY purposes LOOP IF NOT expected ? purpose_name OR expected->purpose_name IS DISTINCT FROM current_state#>ARRAY['ads',purpose_name,'date'] THEN RAISE EXCEPTION 'consent_revision_conflict'; END IF; END LOOP; END IF;
-  PERFORM public._club332_ads_append(m,p_site,decision,purposes,v_key,'club_session');
+  PERFORM set_config('club314.consent_version',p_payload->>'version',true); PERFORM public._club332_ads_append(m,p_site,decision,purposes,v_key,'club_session'); PERFORM set_config('club314.consent_version','',true);
  ELSIF p_payload->>'channel'='whatsapp' THEN
-  IF p_payload->>'version' IS DISTINCT FROM 'whatsapp-v1' OR p_payload ? 'platforms' THEN RAISE EXCEPTION 'consent_payload'; END IF;
+  IF p_payload->>'version' IS NULL OR p_payload->>'version' NOT IN ('whatsapp-v1','whatsapp-v2') OR p_payload ? 'platforms' THEN RAISE EXCEPTION 'consent_payload'; END IF;
   SELECT EXISTS(SELECT 1 FROM public.club_member_whatsapp_consents WHERE member_id=m AND site_id=p_site AND idempotency_key=v_key) INTO prior_key;
   IF decision='granted' AND NOT prior_key THEN current_state:=public._club332_state(m,p_site); expected:=p_payload->'expected_dates'; IF jsonb_typeof(expected) IS DISTINCT FROM 'object' OR NOT expected ? 'whatsapp' OR expected->'whatsapp' IS DISTINCT FROM current_state#>'{whatsapp,date}' THEN RAISE EXCEPTION 'consent_revision_conflict'; END IF; END IF;
-  PERFORM public._club332_whatsapp_append(m,p_site,decision,v_key,'club_session');
+  PERFORM set_config('club314.consent_version',p_payload->>'version',true); PERFORM public._club332_whatsapp_append(m,p_site,decision,v_key,'club_session'); PERFORM set_config('club314.consent_version','',true);
  ELSE RAISE EXCEPTION 'consent_payload'; END IF;
  RETURN jsonb_build_object('ok',true,'consents',public._club332_state(m,p_site));
 END $function$
```

## _crm_whatsapp_latest

```diff
--- antes
+++ depois
@@ -7,7 +7,7 @@
  SELECT w.decision,w.decided_at,m.phone,w.phone_fp
  FROM public.club_members m JOIN public.club_member_whatsapp_consents w
  ON w.member_id=m.id AND w.site_id=m.site_id AND w.company_id=m.company_id
- WHERE m.contact_id=p_contact AND m.company_id=p_company AND w.version='whatsapp-v1'
+ WHERE m.contact_id=p_contact AND m.company_id=p_company AND w.version IN ('whatsapp-v1','whatsapp-v2')
  ORDER BY w.id DESC LIMIT 1
 $function$
 
```

## crm_whatsapp_eligible

```diff
--- antes
+++ depois
@@ -13,6 +13,6 @@
  IF FOUND THEN RETURN coalesce(latest.decision='granted' AND latest.phone=c.phone_e164
  AND latest.phone_fp=public._club332_whatsapp_fp(c.phone_e164),false); END IF;
  -- Pre-existing legacy true is preserved; explicit revocation above always prevails.
- RETURN c.consent_whatsapp_source IS DISTINCT FROM 'club_profile_whatsapp-v1';
+ RETURN coalesce(c.consent_whatsapp_source NOT IN ('club_profile_whatsapp-v1','club_profile_whatsapp-v2'),true);
 END $function$
 
```

## crm_meta_audience_collect_leads

```diff
--- antes
+++ depois
@@ -56,8 +56,8 @@
     WHERE m.company_id=v_company_id AND s.domain='newgangfestival.pt' AND s.brand_key='newgang' AND s.active
       AND m.confirmed_at IS NOT NULL
       AND p.birth_date IS NOT NULL AND isfinite(p.birth_date)
-      AND p.birth_date <= ((statement_timestamp() AT TIME ZONE 'Europe/Lisbon')::date-interval '13 years')::date
-      AND consent.state='granted' AND consent.banner_version='anuncios-v1'
+      AND public.club_age_class(p.birth_date) = 'adult'
+      AND consent.state='granted' AND consent.banner_version IN ('anuncios-v1','anuncios-v2')
       AND NOT EXISTS(SELECT 1 FROM public.marketing_consent_events newer WHERE newer.subject_id=consent.subject_id AND newer.revision>consent.revision)
       AND length(lower(btrim(m.email))) BETWEEN 3 AND 254
       AND lower(btrim(m.email)) ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
```

## club_profile_state

```diff
--- antes
+++ depois
@@ -12,7 +12,7 @@
  SELECT * INTO p FROM club_member_profiles WHERE member_id=m.id;
  SELECT * INTO s FROM club_profile_settings WHERE site_id=p_site;
  SELECT coalesce(sum(points),0)::int INTO n FROM club_points WHERE member_id=m.id AND (rule_key='profile_complete' OR (rule_key='void' AND ref_id='profile_complete:'||m.id::text));
- RETURN jsonb_build_object('birth_date',p.birth_date,'birth_country',p.birth_country,'residence_country',p.residence_country,'city',p.city,'phone',m.phone,
+ RETURN jsonb_build_object('birth_date',p.birth_date,'age_class',public.club_age_class(p.birth_date),'birth_country',p.birth_country,'residence_country',p.residence_country,'city',p.city,'phone',m.phone,
   'complete',p.birth_date IS NOT NULL AND p.birth_country IS NOT NULL AND p.residence_country IS NOT NULL AND (p.residence_country IS DISTINCT FROM 'PT' OR p.city IS NOT NULL),
   'completed_at',p.completed_at,'reward_claimed',p.completed_at IS NOT NULL,'eligible',coalesce(s.enabled,false) AND p.completed_at IS NULL,
   'available',coalesce(s.enabled,false),'points',n,'reward_points',50,'version',s.version,'scope','adesao','whatsapp',jsonb_build_object('status','adapter_pending','editable',false));
```

## crm_ingest_lead_captures

```diff
--- antes
+++ depois
@@ -58,6 +58,11 @@
         n_club_deferred := n_club_deferred + 1; CONTINUE;
       END IF;
       v_club_seen := v_club_seen || lower(btrim(lc.email));
+      -- #314: menor de 13 pela data completa não cria contacto, lead, membro nem consentimentos.
+      IF public.club_age_class(public._club314_birth_date(lc.raw->>'birth_date')) = 'under13' THEN
+        UPDATE public.lead_capture SET processed = true, processed_at = now(), processing_error = 'under13_blocked' WHERE id = lc.id;
+        CONTINUE;
+      END IF;
     END IF;
 
     v_email := NULLIF(lower(btrim(coalesce(lc.email, ''))), '');
```

## club_from_lead_capture

```diff
--- antes
+++ depois
@@ -6,10 +6,19 @@
 AS $function$
 DECLARE s uuid; c uuid; mid uuid; is_new boolean; cc text; j jsonb; st text; BEGIN
   IF NEW.source IS DISTINCT FROM 'clube_newgang' OR NEW.email IS NULL THEN RETURN NEW; END IF;
+  IF NEW.processing_error IS NOT DISTINCT FROM 'under13_blocked' THEN RETURN NEW; END IF;
   SELECT id INTO s FROM portal_sites WHERE brand_key = 'newgang' AND active AND company_id = NEW.company_id ORDER BY created_at LIMIT 1;
   IF s IS NULL THEN RETURN NEW; END IF;
   SELECT id INTO c FROM contacts WHERE lower(trim(email)) = lower(trim(NEW.email)) AND company_id = NEW.company_id LIMIT 1;
   mid := club_upsert_member(s, NEW.email, split_part(coalesce(NEW.name,''),' ',1), NEW.phone, c, NEW.raw->>'referral_code', 'formulario');
+  IF mid IS NOT NULL AND public._club314_birth_date(NEW.raw->>'birth_date') IS NOT NULL THEN
+    BEGIN
+      INSERT INTO club_member_profiles(member_id, site_id, company_id, birth_date)
+      SELECT mid, cm.site_id, cm.company_id, public._club314_birth_date(NEW.raw->>'birth_date') FROM club_members cm WHERE cm.id = mid
+      ON CONFLICT (member_id) DO UPDATE SET birth_date = EXCLUDED.birth_date, updated_at = now()
+      WHERE club_member_profiles.birth_date IS NULL;
+    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'club_from_lead_capture birth_date: %', SQLERRM; END;
+  END IF;
   IF mid IS NOT NULL AND NEW.raw ? 'terms_version' THEN
     PERFORM club_record_terms(mid, NEW.raw->>'terms_version', NEW.created_at);
   END IF;
```
