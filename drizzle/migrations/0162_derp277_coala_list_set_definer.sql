-- A vista coala_list_members respeita a RLS de lead_capture do utilizador;
-- o conjunto da lista é lido como definer, só para a empresa Coala com a chave ativa.
CREATE OR REPLACE FUNCTION public.crm_coala_list_set()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE WHEN public.current_company_id() = '7d831e59-6e82-427b-95a0-64904aae5dd2'::uuid
               AND public.crm_has_feature('crm-coala-eb27')
    THEN COALESCE((SELECT jsonb_object_agg(email, true) FROM (SELECT DISTINCT email FROM public.coala_list_members) m), '{}'::jsonb)
    ELSE '{}'::jsonb END
$$;
REVOKE ALL ON FUNCTION public.crm_coala_list_set() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_coala_list_set() TO authenticated;