-- #332 whatsapp — consentimento WhatsApp por pessoa (Fase A: preparação; NÃO aplicar sem «Sim» do Pedro).
-- Mesmo livro append-only da família #332; sem envios, webhooks, pontos, crons ou campanhas.

CREATE TABLE public.club_member_whatsapp_consents (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id uuid NOT NULL REFERENCES public.club_members(id),
 site_id uuid NOT NULL REFERENCES public.portal_sites(id),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 version text NOT NULL CHECK (version='whatsapp-v1'),
 decision text NOT NULL CHECK (decision IN ('granted','revoked')),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 origin text NOT NULL CHECK (origin IN ('club_session')),
 phone_fp text, -- HMAC-SHA256 hex do telefone no momento da decisão (chave no Vault); nunca o número em claro
 idempotency_key uuid NOT NULL,
 UNIQUE(member_id,site_id,idempotency_key)
);
REVOKE ALL ON public.club_member_whatsapp_consents FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.club_member_whatsapp_consents TO service_role;
GRANT USAGE ON SEQUENCE public.club_member_whatsapp_consents_id_seq TO service_role;
ALTER TABLE public.club_member_whatsapp_consents ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.club_member_whatsapp_consents IS '#332 whatsapp: livro append-only; phone_fp=HMAC-SHA256(telefone, chave app_secrets club_whatsapp_hmac_key) na decisão; mudança de número invalida o grant até nova autorização.';

-- Impressão digital do número: HMAC-SHA256 com chave secreta em app_secrets (RLS sem grants: só SECURITY DEFINER lê;
-- valor gerado dentro da base, nunca em claro no livro, logs, migrações ou chat).
-- Interna: sem EXECUTE para qualquer role; só chamada pelas funções SECURITY DEFINER desta família.
CREATE FUNCTION public._club332_whatsapp_fp(p_phone text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions,pg_catalog AS $$
DECLARE k text;
BEGIN
 IF p_phone IS NULL THEN RETURN NULL; END IF;
 SELECT value INTO k FROM public.app_secrets WHERE name='club_whatsapp_hmac_key';
 IF k IS NULL THEN RAISE EXCEPTION 'whatsapp_fp_unavailable'; END IF;
 RETURN encode(extensions.hmac(convert_to(p_phone,'UTF8'),convert_to(k,'UTF8'),'sha256'),'hex');
END $$;
REVOKE EXECUTE ON FUNCTION public._club332_whatsapp_fp(text) FROM PUBLIC,anon,authenticated,service_role;

-- Append-only: reutiliza o guarda da família #332 (ramo genérico valida membro/site/empresa Newgang).
CREATE TRIGGER club332_whatsapp_history BEFORE INSERT OR UPDATE OR DELETE ON public.club_member_whatsapp_consents
 FOR EACH ROW EXECUTE FUNCTION public._club332_history_guard();
CREATE TRIGGER club332_whatsapp_no_truncate BEFORE TRUNCATE ON public.club_member_whatsapp_consents
 FOR EACH STATEMENT EXECUTE FUNCTION public._club332_history_guard();

CREATE FUNCTION public._club332_whatsapp_append(p_member uuid,p_site uuid,p_decision text,p_key uuid,p_origin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_catalog AS $$
DECLARE old public.club_member_whatsapp_consents; co uuid; ph text; fp text;
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN ('granted','revoked') OR p_key IS NULL THEN RAISE EXCEPTION 'consent_payload'; END IF;
 SELECT company_id, phone INTO co, ph FROM public.club_members WHERE id=p_member AND site_id=p_site;
 IF co IS NULL THEN RAISE EXCEPTION 'consent_scope'; END IF;
 SELECT * INTO old FROM public.club_member_whatsapp_consents WHERE member_id=p_member AND site_id=p_site AND idempotency_key=p_key;
 IF FOUND THEN IF old.decision<>p_decision OR old.origin<>p_origin THEN RAISE EXCEPTION 'idempotency_conflict'; END IF; RETURN; END IF;
 IF p_decision='granted' THEN
   IF ph IS NULL OR ph !~ '^\+[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'whatsapp_no_phone'; END IF;
 END IF;
 fp:=public._club332_whatsapp_fp(ph);
 INSERT INTO public.club_member_whatsapp_consents(member_id,site_id,company_id,version,decision,origin,phone_fp,idempotency_key)
 VALUES(p_member,p_site,co,'whatsapp-v1',p_decision,p_origin,fp,p_key);
END $$;

-- Estado derivado: última linha manda; grant só é válido se o telefone atual bater com phone_fp.
CREATE OR REPLACE FUNCTION public._club332_state(p_member uuid,p_site uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions,pg_catalog AS $$
DECLARE result jsonb; ads jsonb; em record; wa record; cur_phone text; wa_valid boolean; wa_masked text;
BEGIN
 SELECT decision,version,decided_at INTO em FROM public.club_member_email_consents WHERE member_id=p_member AND site_id=p_site ORDER BY id DESC LIMIT 1;
 SELECT jsonb_object_agg(p.purpose,jsonb_build_object('state',CASE WHEN e.state='granted' AND NOT coalesce(e.valid_grant,false) THEN 'expired' ELSE coalesce(e.state,'unknown') END,'version',e.banner_version,'date',e.server_received_at)) INTO ads FROM unnest(ARRAY['meta_ads','tiktok_ads','google_ads']) p(purpose) LEFT JOIN LATERAL (SELECT ev.state,ev.banner_version,ev.server_received_at,f.valid_grant FROM public.club_member_marketing_consents l JOIN public.marketing_consent_events ev ON ev.id=l.event_id LEFT JOIN LATERAL public.marketing_consent_effective(ev.subject_id,clock_timestamp()) f ON f.event_id=ev.id WHERE l.member_id=p_member AND l.site_id=p_site AND l.purpose=p.purpose ORDER BY ev.revision DESC,ev.id DESC LIMIT 1) e ON true;
 SELECT decision,version,decided_at,phone_fp INTO wa FROM public.club_member_whatsapp_consents WHERE member_id=p_member AND site_id=p_site ORDER BY id DESC LIMIT 1;
 SELECT phone INTO cur_phone FROM public.club_members WHERE id=p_member AND site_id=p_site;
 wa_valid:= wa.decision='granted' AND cur_phone IS NOT NULL AND wa.phone_fp IS NOT NULL
   AND wa.phone_fp=public._club332_whatsapp_fp(cur_phone);
 wa_masked:=CASE WHEN cur_phone IS NOT NULL AND length(cur_phone)>=6
   THEN left(cur_phone,4)||'•••••'||right(cur_phone,3) END;
 result:=jsonb_build_object(
  'email',jsonb_build_object('state',coalesce(em.decision,'unknown'),'version',em.version,'date',em.decided_at),
  'ads',ads,
  'whatsapp',jsonb_build_object('state',coalesce(wa.decision,'unknown'),'version',wa.version,'date',wa.decided_at,
    'number_masked',wa_masked,'valid_for_current_number',coalesce(wa_valid,false)));
 RETURN result;
END $$;

-- club_profile_preferences: novo canal 'whatsapp' (versão whatsapp-v1, sem platforms).
-- CAS em grant via expected_dates.whatsapp; revoke nunca exige telefone; guarda parental <13 já cobre grants.
CREATE OR REPLACE FUNCTION public.club_profile_preferences(p_site uuid,p_session_hash text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE m uuid; again uuid; decision text; v_key uuid; purposes text[]; bd date; current_state jsonb; prior_key boolean; expected jsonb; purpose_name text;
BEGIN
 m:=public._club332_session(p_site,p_session_hash);
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) fields(key) WHERE fields.key NOT IN ('channel','version','granted','platforms','idempotency_key','expected_dates')) OR jsonb_typeof(p_payload->'granted') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'consent_payload'; END IF;
 BEGIN v_key:=(p_payload->>'idempotency_key')::uuid; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'consent_payload'; END;
 IF v_key IS NULL THEN RAISE EXCEPTION 'consent_payload'; END IF;
 decision:=CASE WHEN (p_payload->>'granted')::boolean THEN 'granted' ELSE 'revoked' END;
 PERFORM public._club_site_lock(p_site,false);
 PERFORM 1 FROM public.club_members WHERE id=m FOR NO KEY UPDATE;
 again:=public._club332_session(p_site,p_session_hash);
 IF again<>m THEN RAISE EXCEPTION 'no_session'; END IF;
 IF decision='granted' THEN SELECT birth_date INTO bd FROM public.club_member_profiles WHERE member_id=m AND site_id=p_site; IF bd IS NULL OR bd>((clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date-interval '13 years')::date THEN RAISE EXCEPTION 'parental_flow_required'; END IF; END IF;
 IF p_payload->>'channel'='email' THEN
  IF p_payload->>'version' IS DISTINCT FROM 'email-v3' OR p_payload ? 'platforms' THEN RAISE EXCEPTION 'consent_payload'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.club_member_email_consents WHERE member_id=m AND site_id=p_site AND idempotency_key=v_key) INTO prior_key;
  IF decision='granted' AND NOT prior_key THEN current_state:=public._club332_state(m,p_site); expected:=p_payload->'expected_dates'; IF jsonb_typeof(expected) IS DISTINCT FROM 'object' OR NOT expected ? 'email' OR expected->'email' IS DISTINCT FROM current_state#>'{email,date}' THEN RAISE EXCEPTION 'consent_revision_conflict'; END IF; END IF;
  PERFORM public._club332_email_append(m,p_site,decision,v_key,'club_session');
 ELSIF p_payload->>'channel'='ads' THEN
  IF p_payload->>'version' IS DISTINCT FROM 'anuncios-v1' OR jsonb_typeof(p_payload->'platforms') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'platforms') v WHERE jsonb_typeof(v)<>'string') THEN RAISE EXCEPTION 'consent_payload'; END IF;
  SELECT array_agg(v) INTO purposes FROM jsonb_array_elements_text(p_payload->'platforms') v;
  IF cardinality(purposes) IS NULL OR cardinality(purposes) NOT BETWEEN 1 AND 3 OR EXISTS(SELECT 1 FROM unnest(purposes) p WHERE p NOT IN ('meta_ads','tiktok_ads','google_ads')) OR cardinality(purposes)<>(SELECT count(DISTINCT p) FROM unnest(purposes) p) THEN RAISE EXCEPTION 'consent_payload'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.club_member_marketing_consents WHERE member_id=m AND site_id=p_site AND request_key=v_key) INTO prior_key;
  IF decision='granted' AND NOT prior_key THEN current_state:=public._club332_state(m,p_site); expected:=p_payload->'expected_dates'; IF jsonb_typeof(expected) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'consent_revision_conflict'; END IF; FOREACH purpose_name IN ARRAY purposes LOOP IF NOT expected ? purpose_name OR expected->purpose_name IS DISTINCT FROM current_state#>ARRAY['ads',purpose_name,'date'] THEN RAISE EXCEPTION 'consent_revision_conflict'; END IF; END LOOP; END IF;
  PERFORM public._club332_ads_append(m,p_site,decision,purposes,v_key,'club_session');
 ELSIF p_payload->>'channel'='whatsapp' THEN
  IF p_payload->>'version' IS DISTINCT FROM 'whatsapp-v1' OR p_payload ? 'platforms' THEN RAISE EXCEPTION 'consent_payload'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.club_member_whatsapp_consents WHERE member_id=m AND site_id=p_site AND idempotency_key=v_key) INTO prior_key;
  IF decision='granted' AND NOT prior_key THEN current_state:=public._club332_state(m,p_site); expected:=p_payload->'expected_dates'; IF jsonb_typeof(expected) IS DISTINCT FROM 'object' OR NOT expected ? 'whatsapp' OR expected->'whatsapp' IS DISTINCT FROM current_state#>'{whatsapp,date}' THEN RAISE EXCEPTION 'consent_revision_conflict'; END IF; END IF;
  PERFORM public._club332_whatsapp_append(m,p_site,decision,v_key,'club_session');
 ELSE RAISE EXCEPTION 'consent_payload'; END IF;
 RETURN jsonb_build_object('ok',true,'consents',public._club332_state(m,p_site));
END $$;

DO $$ DECLARE f text; BEGIN FOREACH f IN ARRAY ARRAY['_club332_whatsapp_append(uuid,uuid,text,uuid,text)','_club332_state(uuid,uuid)','club_profile_preferences(uuid,text,jsonb)'] LOOP EXECUTE 'REVOKE EXECUTE ON FUNCTION public.'||f||' FROM PUBLIC,anon,authenticated,service_role'; END LOOP; END $$;
GRANT EXECUTE ON FUNCTION public.club_profile_preferences(uuid,text,jsonb) TO service_role;
