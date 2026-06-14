CREATE OR REPLACE FUNCTION public.crm_auto_link_meta_campaigns_to_events(p_company_id uuid)
RETURNS TABLE(updated_count integer, total_active_campaigns integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'crm', 'extensions'
AS $$
  SELECT * FROM crm.auto_link_meta_campaigns_to_events(p_company_id);
$$;

GRANT EXECUTE ON FUNCTION public.crm_auto_link_meta_campaigns_to_events(uuid) TO authenticated, service_role;