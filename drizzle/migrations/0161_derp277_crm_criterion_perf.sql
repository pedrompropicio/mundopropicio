-- D-ERP277: avaliação set-based — a lista Coala é lida uma vez (jsonb com chaves = emails).
CREATE OR REPLACE FUNCTION public.crm_coala_list_set()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT CASE WHEN public.current_company_id() = '7d831e59-6e82-427b-95a0-64904aae5dd2'::uuid
               AND public.crm_has_feature('crm-coala-eb27')
    THEN COALESCE((SELECT jsonb_object_agg(email, true) FROM (SELECT DISTINCT email FROM public.coala_list_members) m), '{}'::jsonb)
    ELSE '{}'::jsonb END
$$;

CREATE OR REPLACE FUNCTION public.crm_filter_match(c public.contacts, f jsonb, p_coala jsonb)
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
      AND p_coala ? lower(btrim(c.email))
  END, false)
$$;

CREATE OR REPLACE FUNCTION public.crm_criterion_match(c public.contacts, criterion jsonb, p_coala jsonb)
 RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN COALESCE(jsonb_array_length(criterion->'filters'), 0) = 0 THEN true
    WHEN criterion->>'match' = 'any' THEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(criterion->'filters') x WHERE public.crm_filter_match(c, x.value, p_coala))
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(criterion->'filters') x WHERE NOT public.crm_filter_match(c, x.value, p_coala))
  END
$$;

CREATE OR REPLACE FUNCTION public.crm_audience_lists()
 RETURNS TABLE(audience_id uuid, name text, snapshot_id uuid, member_count integer, captured_at timestamptz, live_count bigint)
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
declare v_set jsonb := public.crm_coala_list_set();
begin
  return query
  SELECT a.id, a.name, s.id, s.member_count, s.captured_at,
         (SELECT count(*) FROM public.contacts c
           WHERE c.company_id = a.company_id AND public.crm_criterion_match(c, a.criterion, v_set))::bigint
    FROM public.audiences a
    LEFT JOIN LATERAL (
      SELECT sn.id, sn.member_count, sn.captured_at FROM public.audience_snapshots sn
       WHERE sn.audience_id = a.id ORDER BY sn.captured_at DESC, sn.id DESC LIMIT 1
    ) s ON true
   WHERE a.company_id = public.current_company_id()
     AND public.crm_audience_is_visible(a.criterion)
   ORDER BY a.name;
end
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
    SELECT c.id, c.name, c.email, c.phone_e164, c.source, c.consent_email, c.consent_whatsapp, c.is_active, c.last_activity_at
      FROM public.contacts c, a
     WHERE c.company_id = a.company_id
       AND public.crm_criterion_match(c, a.criterion, v_set)
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
    INTO v;
  RETURN v;
end
$$;

DROP FUNCTION IF EXISTS public.crm_criterion_match(public.contacts, jsonb);
DROP FUNCTION IF EXISTS public.crm_filter_match(public.contacts, jsonb);

REVOKE ALL ON FUNCTION public.crm_coala_list_set() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_filter_match(public.contacts, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_criterion_match(public.contacts, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_coala_list_set() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_filter_match(public.contacts, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_criterion_match(public.contacts, jsonb, jsonb) TO authenticated;