CREATE OR REPLACE FUNCTION public.meta_ad_destinations(p_account_id text DEFAULT NULL)
RETURNS TABLE(ad_id text, nome text, status text, campaign_id text, url_destino text, url_tags text, slug text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, crm
AS $$
  WITH b AS (
    SELECT s.external_ad_id, s.name, coalesce(s.effective_status, s.status) st, s.external_campaign_id, s.raw->'creative' c
    FROM crm.meta_ad_snapshot s
    WHERE p_account_id IS NULL OR s.ad_account_id = CASE WHEN p_account_id LIKE 'act\_%' THEN p_account_id ELSE 'act_'||p_account_id END
  ), u AS (
    SELECT b.*, coalesce(
      c#>>'{object_story_spec,link_data,link}',
      c#>>'{object_story_spec,video_data,call_to_action,value,link}',
      c#>>'{object_story_spec,link_data,call_to_action,value,link}',
      c#>>'{asset_feed_spec,link_urls,0,website_url}',
      c->>'link_url') url
    FROM b
  )
  SELECT external_ad_id, name, st, external_campaign_id, url, c->>'url_tags',
         substring(url from '/m/([a-z0-9]+(?:-[a-z0-9]+)*)')
  FROM u ORDER BY external_campaign_id, external_ad_id;
$$;
REVOKE ALL ON FUNCTION public.meta_ad_destinations(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meta_ad_destinations(text) TO authenticated, service_role;