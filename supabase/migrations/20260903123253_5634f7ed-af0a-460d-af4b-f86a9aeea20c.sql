-- Normalização de rótulos de zona vindos das bilheteiras.
-- "ARENA - Lote 2 - JARDINS DO CASINO ESTORIL" -> "arena"
-- "ARENA | Mob.Reduzida  - JARDINS DO CASINO ESTORIL" -> "arena"
CREATE OR REPLACE FUNCTION public.normalize_zone_label(_label text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT lower(
    btrim(
      regexp_replace(
        extensions.unaccent(
          split_part(split_part(coalesce(_label, ''), ' - ', 1), ' | ', 1)
        ),
        '\s+', ' ', 'g'
      )
    )
  );
$$;

COMMENT ON FUNCTION public.normalize_zone_label(text) IS
  'Normaliza rótulo de zona/lote das bilheteiras: prefixo antes de " - " e " | ", sem acentos, sem espaços duplos, minúsculas.';

-- Carga corrente por zona do ERP: último retrato de event_zone_capacities
-- (uma só data, max(observed_on) <= _on), agregado por zona.
CREATE OR REPLACE FUNCTION public.zone_capacity_snapshot(
  _event_id uuid,
  _on date DEFAULT current_date
)
RETURNS TABLE (
  zone_id uuid,
  zone_name text,
  capacity numeric,
  available numeric,
  blocked numeric,
  occupied numeric,
  observed_on date,
  source text,
  unmatched_labels jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND public.row_belongs_to_current_company(e.company_id)
  ) INTO v_ok;
  IF NOT v_ok THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH snap AS (
    SELECT max(ezc.observed_on) AS d
    FROM public.event_zone_capacities ezc
    WHERE ezc.event_id = _event_id
      AND ezc.observed_on IS NOT NULL
      AND ezc.observed_on <= _on
  ),
  src AS (
    SELECT ezc.*, public.normalize_zone_label(ezc.zone_label) AS norm
    FROM public.event_zone_capacities ezc
    JOIN snap s ON ezc.observed_on = s.d
    WHERE ezc.event_id = _event_id
  ),
  zones AS (
    SELECT z.id, z.name, public.normalize_zone_label(z.name) AS norm
    FROM public.event_ticket_zones z
    WHERE z.event_id = _event_id
  ),
  matched AS (
    SELECT src.*, z.id AS zid, z.name AS zname
    FROM src
    LEFT JOIN zones z ON z.norm = src.norm
  ),
  unmatched AS (
    SELECT coalesce(
      jsonb_agg(DISTINCT jsonb_build_object(
        'zone_label', m.zone_label,
        'capacity', m.capacity,
        'available', m.available,
        'blocked', m.blocked,
        'occupied', m.occupied,
        'source', m.source
      )), '[]'::jsonb) AS labels
    FROM matched m
    WHERE m.zid IS NULL
  )
  SELECT
    m.zid,
    m.zname,
    sum(coalesce(m.capacity, 0))::numeric,
    sum(coalesce(m.available, 0))::numeric,
    sum(coalesce(m.blocked, 0))::numeric,
    sum(coalesce(m.occupied, 0))::numeric,
    max(m.observed_on),
    max(m.source),
    (SELECT labels FROM unmatched)
  FROM matched m
  WHERE m.zid IS NOT NULL
  GROUP BY m.zid, m.zname
  ORDER BY m.zname;
END;
$$;

COMMENT ON FUNCTION public.zone_capacity_snapshot(uuid, date) IS
  'Carga corrente por zona do ERP a partir do último retrato diário de event_zone_capacities (DR-2026-09-03-D20).';

GRANT EXECUTE ON FUNCTION public.normalize_zone_label(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zone_capacity_snapshot(uuid, date) TO authenticated;