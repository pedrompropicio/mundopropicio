CREATE TABLE IF NOT EXISTS public.backup_excluded_tables (
  schema_name text NOT NULL,
  table_name  text NOT NULL,
  reason      text NOT NULL,
  excluded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schema_name, table_name)
);

GRANT SELECT ON public.backup_excluded_tables TO authenticated;
GRANT ALL    ON public.backup_excluded_tables TO service_role;

ALTER TABLE public.backup_excluded_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backup_excluded_tables_select_admin ON public.backup_excluded_tables;
CREATE POLICY backup_excluded_tables_select_admin
  ON public.backup_excluded_tables
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin'));

INSERT INTO public.backup_excluded_tables (schema_name, table_name, reason)
VALUES ('public','ticketline_sync_runs','Payload cru do relatório Ticketline: 89 MB em disco, ~762 MB em JSON. Diagnóstico de sincronização, não é dado de negócio. Retenção por definir — ver Issue.')
ON CONFLICT (schema_name, table_name) DO NOTHING;

INSERT INTO public.system_invariants (name, severity, scope, reference_count, description, notes)
VALUES ('backup_tabelas_excluidas','warn','global',1,'Tabelas deliberadamente fora do backup','Lista rastreada em public.backup_excluded_tables. Qualquer exclusao nova faz o verificador acusar desvio.')
ON CONFLICT (name) DO UPDATE SET severity = EXCLUDED.severity,
                                 scope = EXCLUDED.scope,
                                 reference_count = EXCLUDED.reference_count,
                                 description = EXCLUDED.description;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  cB bigint; sB jsonb;
  cX bigint; sX jsonb;
BEGIN
  WITH em_falta AS (
    SELECT c.id AS company_id, c.slug,
           (SELECT max(b.finished_at) FROM public.backup_runs b
             WHERE b.company_id = c.id AND b.status = 'ok') AS ultimo_ok
      FROM public.companies c
     WHERE c.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM public.backup_runs b
          WHERE b.company_id = c.id
            AND b.status = 'ok'
            AND b.finished_at > now() - interval '30 hours'
       )
  ),
  global_falta AS (
    SELECT NULL::uuid AS company_id, 'global'::text AS slug,
           (SELECT max(b.finished_at) FROM public.backup_runs b
             WHERE b.scope = 'global' AND b.status = 'ok') AS ultimo_ok
     WHERE NOT EXISTS (
       SELECT 1 FROM public.backup_runs b
        WHERE b.scope = 'global'
          AND b.status = 'ok'
          AND b.finished_at > now() - interval '30 hours'
     )
  ),
  bad AS (
    SELECT * FROM em_falta
    UNION ALL
    SELECT * FROM global_falta
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 6) x), '[]'::jsonb)
    INTO cB, sB FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cB, i.reference_count, (cB = i.reference_count) AS conforme,
         i.notes, sB
    FROM public.system_invariants i
   WHERE i.name = 'backup_empresa_em_falta';

  SELECT count(*),
         COALESCE((SELECT jsonb_agg(jsonb_build_object('tabela', e.schema_name || '.' || e.table_name, 'motivo', e.reason))
                     FROM public.backup_excluded_tables e), '[]'::jsonb)
    INTO cX, sX FROM public.backup_excluded_tables;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cX, i.reference_count, (cX = i.reference_count) AS conforme,
         i.notes, sX
    FROM public.system_invariants i
   WHERE i.name = 'backup_tabelas_excluidas';
END;
$function$;