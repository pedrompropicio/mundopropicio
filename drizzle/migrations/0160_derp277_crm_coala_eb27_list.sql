-- D-ERP277: avaliador de critério no servidor, contagem atual por audiência,
-- lista dinâmica Coala EB27 (vista coala_list_members) e contacto em confirmar_lista.

CREATE OR REPLACE FUNCTION public.crm_has_feature(p_key text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_features f
                  WHERE f.company_id = public.current_company_id()
                    AND f.feature_key = p_key AND f.enabled)
$$;

CREATE OR REPLACE FUNCTION public.crm_filter_match(c public.contacts, f jsonb)
 RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT COALESCE(CASE f->>'field'
    WHEN 'has_email' THEN (c.email IS NOT NULL) = (f->>'value')::boolean
    WHEN 'has_phone' THEN (c.phone_e164 IS NOT NULL) = (f->>'value')::boolean
    WHEN 'consent_email' THEN c.consent_email = (f->>'value')::boolean
    WHEN 'consent_whatsapp' THEN c.consent_whatsapp = (f->>'value')::boolean
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
      AND public.crm_has_feature('crm-coala-eb27')
      AND EXISTS (SELECT 1 FROM public.coala_list_members m WHERE m.email = lower(btrim(c.email)))
  END, false)
$$;

CREATE OR REPLACE FUNCTION public.crm_criterion_match(c public.contacts, criterion jsonb)
 RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN COALESCE(jsonb_array_length(criterion->'filters'), 0) = 0 THEN true
    WHEN criterion->>'match' = 'any' THEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(criterion->'filters') x WHERE public.crm_filter_match(c, x.value))
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(criterion->'filters') x WHERE NOT public.crm_filter_match(c, x.value))
  END
$$;

CREATE OR REPLACE FUNCTION public.crm_audience_is_visible(criterion jsonb)
 RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(criterion->'filters','[]'::jsonb)) x
                      WHERE x.value->>'field' = 'coala_list')
      OR public.crm_has_feature('crm-coala-eb27')
$$;

DROP FUNCTION IF EXISTS public.crm_audience_lists();
CREATE FUNCTION public.crm_audience_lists()
 RETURNS TABLE(audience_id uuid, name text, snapshot_id uuid, member_count integer, captured_at timestamptz, live_count bigint)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT a.id, a.name, s.id, s.member_count, s.captured_at,
         (SELECT count(*) FROM public.contacts c
           WHERE c.company_id = a.company_id AND public.crm_criterion_match(c, a.criterion))::bigint
    FROM public.audiences a
    LEFT JOIN LATERAL (
      SELECT id, member_count, captured_at FROM public.audience_snapshots
       WHERE audience_id = a.id ORDER BY captured_at DESC, id DESC LIMIT 1
    ) s ON true
   WHERE a.company_id = public.current_company_id()
     AND public.crm_audience_is_visible(a.criterion)
   ORDER BY a.name
$$;

CREATE OR REPLACE FUNCTION public.crm_contacts_by_audience(
  p_audience_id uuid, p_search text DEFAULT NULL, p_email text DEFAULT 'all', p_wa text DEFAULT 'all',
  p_active text DEFAULT 'all', p_source text DEFAULT 'all', p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  WITH a AS (
    SELECT * FROM public.audiences
     WHERE id = p_audience_id AND company_id = public.current_company_id()
       AND public.crm_audience_is_visible(criterion)
  ), base AS (
    SELECT c.id, c.name, c.email, c.phone_e164, c.source, c.consent_email, c.consent_whatsapp, c.is_active, c.last_activity_at
      FROM public.contacts c, a
     WHERE c.company_id = a.company_id
       AND public.crm_criterion_match(c, a.criterion)
       AND (COALESCE(btrim(p_search),'') = '' OR c.name ILIKE '%'||btrim(p_search)||'%'
            OR c.email ILIKE '%'||btrim(p_search)||'%' OR c.phone_e164 ILIKE '%'||btrim(p_search)||'%')
       AND (p_email = 'all' OR c.consent_email = (p_email = 'yes'))
       AND (p_wa = 'all' OR c.consent_whatsapp = (p_wa = 'yes'))
       AND (p_active = 'all' OR c.is_active = (p_active = 'yes'))
       AND (p_source = 'all' OR (p_source = '__none__' AND c.source IS NULL) OR c.source = p_source)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM (
        SELECT * FROM base ORDER BY last_activity_at DESC NULLS LAST, id
         OFFSET GREATEST(p_offset,0) LIMIT LEAST(GREATEST(p_limit,1),1000)) p), '[]'::jsonb))
$$;

REVOKE ALL ON FUNCTION public.crm_has_feature(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_filter_match(public.contacts, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_criterion_match(public.contacts, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_audience_is_visible(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_audience_lists() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_contacts_by_audience(uuid,text,text,text,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_has_feature(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_filter_match(public.contacts, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_criterion_match(public.contacts, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_audience_is_visible(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_audience_lists() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_contacts_by_audience(uuid,text,text,text,text,text,integer,integer) TO authenticated;

-- confirmar_lista: garante contacto (só cria se não existir; nunca altera existentes).
CREATE OR REPLACE FUNCTION public.confirmar_lista(p_token text, p_marketing_opt_in boolean, p_locale text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  COALA constant uuid := '7d831e59-6e82-427b-95a0-64904aae5dd2';
  TEXT_VERSION constant text := 'eb2027-v1';
  v_inv public.coala_invites%rowtype;
  v_locale text;
  v_last boolean;
  v_in_list boolean;
  v_status text;
begin
  if p_token is null or length(p_token) <> 64 then
    return jsonb_build_object('status','invalid');
  end if;

  select * into v_inv from public.coala_invites
   where token = p_token and company_id = COALA
   for update;
  if not found then
    return jsonb_build_object('status','invalid');
  end if;

  v_locale := case when lower(coalesce(p_locale, v_inv.locale)) = 'en' then 'en' else 'pt' end;
  v_in_list := v_inv.status = 'confirmed'
    or exists (select 1 from public.coala_list_members m where m.email = v_inv.email);

  if v_in_list then
    select marketing_opt_in into v_last from public.coala_list_consents
     where company_id = COALA and email = v_inv.email
     order by created_at desc limit 1;
    if v_last is distinct from coalesce(p_marketing_opt_in, false) then
      insert into public.coala_list_consents (company_id, email, list_joined, marketing_opt_in, text_version, method, locale, invite_id)
      values (COALA, v_inv.email, true, coalesce(p_marketing_opt_in, false), TEXT_VERSION, 'token_email', v_locale, v_inv.id);
    end if;
    if v_inv.status <> 'confirmed' then
      update public.coala_invites set status = 'confirmed', confirmed_at = now() where id = v_inv.id;
    end if;
    v_status := 'already';
  else
    -- Fonte coala_early_bird_invite: sem email de confirmação (trigger com WHEN)
    -- e sem conversões (process_lead_captures_batch salta esta fonte).
    insert into public.lead_capture (company_id, email, consent_email, source, raw)
    values (COALA, v_inv.email, coalesce(p_marketing_opt_in, false), 'coala_early_bird_invite',
            jsonb_build_object('locale', v_locale, 'invite_id', v_inv.id, 'text_version', TEXT_VERSION, 'list_member', true));

    insert into public.coala_list_consents (company_id, email, list_joined, marketing_opt_in, text_version, method, locale, invite_id)
    values (COALA, v_inv.email, true, coalesce(p_marketing_opt_in, false), TEXT_VERSION, 'token_email', v_locale, v_inv.id);

    update public.coala_invites set status = 'confirmed', confirmed_at = now() where id = v_inv.id;
    v_status := 'confirmed';
  end if;

  -- Contacto: só cria se não existir; consentimento = último marketing_opt_in (lista ≠ marketing).
  select marketing_opt_in into v_last from public.coala_list_consents
   where company_id = COALA and email = v_inv.email
   order by created_at desc limit 1;
  insert into public.contacts (company_id, email, source, consent_email, consent_email_at)
  select COALA, v_inv.email, 'coala_early_bird_invite', coalesce(v_last, false),
         case when v_last then now() end
   where not exists (select 1 from public.contacts c
                      where c.company_id = COALA and lower(btrim(c.email)) = v_inv.email)
  on conflict do nothing;

  return jsonb_build_object('status', v_status, 'locale', v_locale);
end
$function$;

-- Backfill aditivo: emails da vista sem contacto Coala.
INSERT INTO public.contacts (company_id, email, source, consent_email, consent_email_at)
SELECT '7d831e59-6e82-427b-95a0-64904aae5dd2'::uuid, m.email, 'coala_early_bird_invite',
       COALESCE(k.marketing_opt_in, false), CASE WHEN k.marketing_opt_in THEN now() END
  FROM public.coala_list_members m
  LEFT JOIN LATERAL (SELECT marketing_opt_in FROM public.coala_list_consents
                      WHERE company_id = '7d831e59-6e82-427b-95a0-64904aae5dd2' AND email = m.email
                      ORDER BY created_at DESC LIMIT 1) k ON true
 WHERE NOT EXISTS (SELECT 1 FROM public.contacts c
                    WHERE c.company_id = '7d831e59-6e82-427b-95a0-64904aae5dd2' AND lower(btrim(c.email)) = m.email)
ON CONFLICT DO NOTHING;