CREATE OR REPLACE FUNCTION public.get_event_bp_changes(p_event_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (
  changed_at timestamptz,
  action text,
  author text,
  forecast_id uuid,
  description text,
  forecast_type text,
  changes jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH raw AS (
  SELECT l.created_at, l.action, l.changed_by, l.entity_id, l.old_data, l.new_data
  FROM public.system_audit_log l
  WHERE l.entity_type = 'event_forecasts'
    AND coalesce(l.new_data->>'event_id', l.old_data->>'event_id') = p_event_id::text
    AND l.created_at >= now() - ((coalesce(p_days, 30))::text || ' days')::interval
),
fields(ord, field, label) AS (
  VALUES
    (1,  'description',         'Descrição'),
    (2,  'amount',              'Valor'),
    (3,  'type',                'Tipo'),
    (4,  'status',              'Estado'),
    (5,  'category_id',         'Categoria'),
    (6,  'specification',       'Especificação'),
    (7,  'iva_rate',            'Taxa IVA'),
    (8,  'notes',               'Notas'),
    (9,  'exclude_from_result', 'Excluir do resultado'),
    (10, 'is_transitory',       'Transitória'),
    (11, 'formalidade',         'Formalidade'),
    (12, 'transaction_id',      'Transação vinculada')
),
diffed AS (
  SELECT
    r.created_at,
    r.action,
    r.changed_by,
    coalesce((r.new_data->>'id'), (r.old_data->>'id'), r.entity_id::text)::uuid AS forecast_id,
    coalesce(r.new_data->>'description', r.old_data->>'description') AS description,
    coalesce(r.new_data->>'type', r.old_data->>'type') AS forecast_type,
    coalesce((
      SELECT jsonb_agg(x.item ORDER BY x.ord)
      FROM (
        SELECT
          f.ord,
          jsonb_build_object(
            'field',  f.field,
            'label',  f.label,
            'before', CASE WHEN f.field = 'category_id'
                        THEN (SELECT c.code || ' — ' || c.name FROM public.account_categories c
                               WHERE c.id::text = r.old_data->>'category_id')
                        ELSE r.old_data->>f.field END,
            'after',  CASE WHEN f.field = 'category_id'
                        THEN (SELECT c.code || ' — ' || c.name FROM public.account_categories c
                               WHERE c.id::text = r.new_data->>'category_id')
                        ELSE r.new_data->>f.field END
          ) AS item
        FROM fields f
        WHERE (r.old_data->>f.field) IS DISTINCT FROM (r.new_data->>f.field)
      ) x
    ), '[]'::jsonb) AS changes
  FROM raw r
)
SELECT
  d.created_at AS changed_at,
  d.action,
  coalesce(p.full_name, 'Sistema') AS author,
  d.forecast_id,
  d.description,
  d.forecast_type,
  d.changes
FROM diffed d
LEFT JOIN public.profiles p ON p.id::text = d.changed_by
WHERE d.action <> 'update' OR jsonb_array_length(d.changes) > 0
ORDER BY d.created_at DESC
$$;

GRANT EXECUTE ON FUNCTION public.get_event_bp_changes(uuid, integer) TO authenticated;