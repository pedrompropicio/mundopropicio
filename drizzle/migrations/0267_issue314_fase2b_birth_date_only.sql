-- #314 Fase 2b (R2): ação só para a data de nascimento do Clube Newgang.
-- Nova função; nenhuma função existente é alterada. Não atribui pontos, não marca o perfil como completo.
CREATE OR REPLACE FUNCTION public.club_profile_birth_date(p_site uuid, p_session_hash text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE m record; bd date; cur date; BEGIN
 -- Identidade resolvida pela sessão, exatamente como club_profile_confirm.
 SELECT cm.* INTO m FROM club_member_sessions x JOIN club_members cm ON cm.id=x.member_id JOIN portal_sites ps ON ps.id=cm.site_id AND ps.company_id=cm.company_id
 WHERE x.site_id=p_site AND cm.site_id=p_site AND x.token_hash=p_session_hash AND x.purpose='access' AND x.expires_at>statement_timestamp() AND cm.confirmed_at IS NOT NULL AND ps.active AND ps.brand_key='newgang';
 IF NOT FOUND THEN RAISE EXCEPTION 'no_session'; END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k<>'birth_date')
    OR jsonb_typeof(p_payload->'birth_date') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'profile_payload'; END IF;
 bd:=public._club314_birth_date(p_payload->>'birth_date');
 IF bd IS NULL THEN RAISE EXCEPTION 'birth_date_invalid'; END IF;
 IF public.club_age_class(bd)='under13' THEN RAISE EXCEPTION 'parental_flow_required'; END IF;
 PERFORM _club_site_lock(p_site,false);
 PERFORM 1 FROM club_members WHERE id=m.id FOR NO KEY UPDATE;
 IF NOT EXISTS(SELECT 1 FROM club_member_sessions WHERE token_hash=p_session_hash AND site_id=p_site AND member_id=m.id AND purpose='access' AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'no_session'; END IF;
 SELECT birth_date INTO cur FROM club_member_profiles WHERE member_id=m.id;
 IF cur IS NOT NULL THEN RAISE EXCEPTION 'birth_date_already_set'; END IF;
 INSERT INTO club_member_profiles(member_id,site_id,company_id,birth_date)
 VALUES(m.id,p_site,m.company_id,bd)
 ON CONFLICT(member_id) DO UPDATE SET birth_date=EXCLUDED.birth_date,updated_at=now() WHERE club_member_profiles.birth_date IS NULL;
 RETURN jsonb_build_object('ok',true,'profile',club_profile_state(p_site,p_session_hash));
END $function$;

REVOKE ALL ON FUNCTION public.club_profile_birth_date(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_profile_birth_date(uuid,text,jsonb) TO service_role;
