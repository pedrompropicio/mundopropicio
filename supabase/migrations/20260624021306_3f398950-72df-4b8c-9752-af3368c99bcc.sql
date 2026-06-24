CREATE OR REPLACE FUNCTION crm.assembly_creative_pool(p_assembly_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  file_url text,
  type text,
  file_mime_type text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, crm
AS $$
  WITH a AS (
    SELECT event_id, company_id
    FROM crm.assisted_assembly
    WHERE id = p_assembly_id
  ),
  slug_seg AS (
    SELECT
      a.event_id,
      a.company_id,
      NULLIF(
        regexp_replace(
          COALESCE(substring(e.ticketing_url from '/evento/([^/?#]+)'), ''),
          '^([^-]+-[^-]+).*$', '\1'
        ),
        ''
      ) AS slug
    FROM a
    LEFT JOIN public.events e ON e.id = a.event_id
  ),
  set_a_assembly_ids AS (
    SELECT DISTINCT (cid)::uuid AS id
    FROM crm.assisted_assembly aa
    JOIN a ON aa.event_id = a.event_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(aa.adsets, '[]'::jsonb)) ads
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(ads->'creative_ids', '[]'::jsonb)) cid
    WHERE cid IS NOT NULL AND cid <> ''
  ),
  set_a_design_ids AS (
    SELECT DISTINCT (p->>'creative_id')::uuid AS id
    FROM crm.campaign_design cd
    JOIN a ON cd.event_id = a.event_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(cd.adsets, '[]'::jsonb)) ads
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ads->'pecas', '[]'::jsonb)) p
    WHERE p->>'creative_id' IS NOT NULL
  ),
  set_a_ids AS (
    SELECT id FROM set_a_assembly_ids
    UNION
    SELECT id FROM set_a_design_ids
  ),
  set_a AS (
    SELECT mc.id, mc.name, mc.file_url, mc.type, mc.file_mime_type
    FROM crm.meta_creatives mc
    JOIN set_a_ids sa ON sa.id = mc.id
    JOIN slug_seg s ON s.company_id = mc.company_id
    WHERE s.slug IS NOT NULL
      AND mc.link_url ILIKE '%' || s.slug || '%'
      AND NOT (mc.type = 'video' AND mc.name ILIKE '%product.name%')
  ),
  set_b AS (
    SELECT mc.id, mc.name, mc.file_url, mc.type, mc.file_mime_type
    FROM crm.meta_creatives mc
    JOIN slug_seg s ON s.company_id = mc.company_id
    WHERE s.slug IS NOT NULL
      AND mc.type = 'video'
      AND mc.name NOT ILIKE '%product.name%'
      AND mc.link_url ILIKE '%' || s.slug || '%'
  )
  SELECT id, name, file_url, type, file_mime_type FROM set_a
  UNION
  SELECT id, name, file_url, type, file_mime_type FROM set_b;
$$;

GRANT EXECUTE ON FUNCTION crm.assembly_creative_pool(uuid) TO authenticated, service_role;