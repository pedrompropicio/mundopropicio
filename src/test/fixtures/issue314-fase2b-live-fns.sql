-- Cópia das definições Live (26/10/2026) usadas pelo teste PGlite da #314 Fase 2b. Não é migração.
CREATE OR REPLACE FUNCTION public.club_age_class(p_birth date)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT CASE
  WHEN p_birth IS NULL OR NOT isfinite(p_birth) THEN 'unknown'
  WHEN p_birth > ((clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date - interval '13 years')::date THEN 'under13'
  WHEN p_birth > ((clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date - interval '18 years')::date THEN 'minor'
  ELSE 'adult' END
$function$

;

CREATE OR REPLACE FUNCTION public._club314_birth_date(p_raw text)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE d date;
BEGIN
 IF p_raw IS NULL OR p_raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN NULL; END IF;
 BEGIN d := to_date(p_raw,'YYYY-MM-DD'); EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
 IF to_char(d,'YYYY-MM-DD') <> p_raw OR d > (clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date OR extract(year FROM d) < 1900 THEN RETURN NULL; END IF;
 RETURN d;
END $function$

;

CREATE OR REPLACE FUNCTION public.club_profile_state(p_site uuid, p_session_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE m record; p club_member_profiles; s club_profile_settings; n int; BEGIN
 SELECT cm.* INTO m FROM club_member_sessions x JOIN club_members cm ON cm.id=x.member_id
 JOIN portal_sites ps ON ps.id=cm.site_id AND ps.company_id=cm.company_id
 WHERE x.site_id=p_site AND cm.site_id=p_site AND x.token_hash=p_session_hash AND x.purpose='access' AND x.expires_at>statement_timestamp() AND cm.confirmed_at IS NOT NULL AND ps.active AND ps.brand_key='newgang';
 IF NOT FOUND THEN RAISE EXCEPTION 'no_session'; END IF;
 SELECT * INTO p FROM club_member_profiles WHERE member_id=m.id;
 SELECT * INTO s FROM club_profile_settings WHERE site_id=p_site;
 SELECT coalesce(sum(points),0)::int INTO n FROM club_points WHERE member_id=m.id AND (rule_key='profile_complete' OR (rule_key='void' AND ref_id='profile_complete:'||m.id::text));
 RETURN jsonb_build_object('birth_date',p.birth_date,'age_class',public.club_age_class(p.birth_date),'birth_country',p.birth_country,'residence_country',p.residence_country,'city',p.city,'phone',m.phone,
  'complete',p.birth_date IS NOT NULL AND p.birth_country IS NOT NULL AND p.residence_country IS NOT NULL AND (p.residence_country IS DISTINCT FROM 'PT' OR p.city IS NOT NULL),
  'completed_at',p.completed_at,'reward_claimed',p.completed_at IS NOT NULL,'eligible',coalesce(s.enabled,false) AND p.completed_at IS NULL,
  'available',coalesce(s.enabled,false),'points',n,'reward_points',50,'version',s.version,'scope','adesao','whatsapp',jsonb_build_object('status','adapter_pending','editable',false));
END $function$

;

CREATE OR REPLACE FUNCTION public._club330_profile_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'profile_history_preserved'; END IF;
 IF NOT EXISTS(SELECT 1 FROM portal_sites s WHERE s.id=NEW.site_id AND s.company_id=NEW.company_id) THEN RAISE EXCEPTION 'profile_scope'; END IF;
 IF TG_TABLE_NAME='club_member_profiles' THEN
  IF NOT EXISTS(SELECT 1 FROM club_members m WHERE m.id=NEW.member_id AND m.site_id=NEW.site_id AND m.company_id=NEW.company_id) THEN RAISE EXCEPTION 'profile_scope'; END IF;
  IF NEW.birth_date IS NOT NULL AND (NEW.birth_date>(now() AT TIME ZONE 'Europe/Lisbon')::date OR NOT isfinite(NEW.birth_date)) THEN RAISE EXCEPTION 'birth_date_invalid'; END IF;
  IF TG_OP='UPDATE' AND (OLD.member_id IS DISTINCT FROM NEW.member_id OR OLD.site_id IS DISTINCT FROM NEW.site_id OR OLD.company_id IS DISTINCT FROM NEW.company_id
    OR (OLD.completed_at IS NOT NULL AND (OLD.completed_at IS DISTINCT FROM NEW.completed_at OR OLD.award_event_id IS DISTINCT FROM NEW.award_event_id OR (OLD.award_id IS NOT NULL AND OLD.award_id IS DISTINCT FROM NEW.award_id)))) THEN RAISE EXCEPTION 'profile_completion_immutable'; END IF;
 ELSE
  IF TG_OP='UPDATE' AND (OLD.site_id IS DISTINCT FROM NEW.site_id OR OLD.company_id IS DISTINCT FROM NEW.company_id) THEN RAISE EXCEPTION 'profile_scope_immutable'; END IF;
 END IF;
 RETURN NEW;
END $function$

;

CREATE OR REPLACE FUNCTION public._club332_city_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
 IF TG_OP='UPDATE' AND NEW.city IS NOT DISTINCT FROM OLD.city AND NEW.residence_country IS NOT DISTINCT FROM OLD.residence_country THEN RETURN NEW; END IF;
 -- Empty/cleared demographic records remain allowed; they are never complete.
 IF NEW.birth_date IS NULL AND NEW.birth_country IS NULL AND NEW.residence_country IS NULL AND NEW.city IS NULL THEN RETURN NEW; END IF;
 NEW.city:=public.club_city_normalize(NEW.residence_country,NEW.city);
 RETURN NEW;
END $function$

;

