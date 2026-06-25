
-- 1) Colunas em events para guardar a audiência Meta ligada
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS meta_audience_id text DEFAULT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS meta_audience_name text DEFAULT NULL;

-- 2) Preencher retroativamente a partir de meta_custom_audiences (match por pixel_id no filters jsonb)
UPDATE public.events e
SET meta_audience_id = mca.audience_id_meta,
    meta_audience_name = mca.name
FROM public.meta_custom_audiences mca
WHERE e.meta_pixel_id IS NOT NULL
  AND e.meta_pixel_id <> ''
  AND mca.filters->>'pixel_id' = e.meta_pixel_id
  AND e.meta_audience_id IS NULL;

-- 3) Função de deteção: eventos com pixel + leads mas sem audiência
CREATE OR REPLACE FUNCTION crm.events_missing_audience(p_company_id uuid)
RETURNS TABLE (
  event_id uuid,
  name text,
  meta_pixel_id text,
  total_leads bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT e.id, e.name, e.meta_pixel_id, COUNT(l.id) AS total_leads
  FROM public.events e
  JOIN public.leads l ON l.event_id = e.id
  WHERE e.company_id = p_company_id
    AND e.meta_pixel_id IS NOT NULL
    AND e.meta_pixel_id <> ''
    AND (e.meta_audience_id IS NULL OR e.meta_audience_id = '')
  GROUP BY e.id, e.name, e.meta_pixel_id
  HAVING COUNT(l.id) > 0
  ORDER BY COUNT(l.id) DESC;
$$;

GRANT EXECUTE ON FUNCTION crm.events_missing_audience(uuid) TO authenticated;
