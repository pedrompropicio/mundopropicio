-- #78 — invariante: séries paralelas Ticketline (vendas em zonas sync_generated
-- que o último relatório importado já não traz).
CREATE OR REPLACE FUNCTION public._run_invariant_checks_ticketline_series()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  WITH lastrun AS (
    SELECT DISTINCT ON (cf.event_id) cf.event_id, r.import_audit->'zoneLotMap' AS m
      FROM public.ticketline_sync_runs r
      JOIN public.ticketline_sync_config cf ON cf.id = r.config_id
     WHERE r.status IN ('success','warning')
       AND CASE WHEN jsonb_typeof(r.import_audit->'zoneLotMap') = 'array'
                THEN jsonb_array_length(r.import_audit->'zoneLotMap') > 0 ELSE false END
     ORDER BY cf.event_id, r.started_at DESC
  ), hits AS (
    SELECT e.name AS evento, z.name AS zona, sum(ts.quantity) AS bilhetes,
           round(sum(ts.total_value), 2) AS valor, min(ts.sale_date) AS de, max(ts.sale_date) AS ate
      FROM lastrun l
      JOIN public.event_ticket_zones z ON z.event_id = l.event_id AND z.sync_generated
      JOIN public.ticket_sales ts ON ts.zone_id = z.id AND ts.source = 'ticketline_import'
      JOIN public.events e ON e.id = l.event_id
     WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(l.m) x WHERE x->>'zoneId' = z.id::text)
     GROUP BY l.event_id, z.id, e.name, z.name
  )
  SELECT (SELECT count(*) FROM hits),
         COALESCE((SELECT jsonb_agg(to_jsonb(h)) FROM (SELECT * FROM hits ORDER BY bilhetes DESC LIMIT 10) h), '[]'::jsonb)
    INTO c, s;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, i.reference_count,
         (c <= i.reference_count), i.notes, s
    FROM public.system_invariants i
   WHERE i.name = 'ticketline_series_paralelas';
END;
$function$;
REVOKE ALL ON FUNCTION public._run_invariant_checks_ticketline_series() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_ticketline_series() TO service_role;

INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES ('ticketline_series_paralelas',
        'Vendas Ticketline em zonas criadas pela sync que o último relatório importado já não traz (série paralela a somar, caso Deive Braga #78).',
        'error', 'global', 0,
        'Conciliação manual: relatório "Vendas por Evento" do manager, coluna Total Vendas, evento a evento (docs/procedimentos/PROC-conciliacao-ticketline.md).')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT * FROM public._run_invariant_checks_raw()
  UNION ALL SELECT * FROM public._run_invariant_checks_extra()
  UNION ALL SELECT * FROM public._run_invariant_checks_paid()
  UNION ALL SELECT * FROM public._run_invariant_checks_secrets()
  UNION ALL SELECT * FROM public._run_invariant_checks_infra()
  UNION ALL SELECT * FROM public._run_invariant_checks_secdef()
  UNION ALL SELECT * FROM public._run_invariant_checks_docs()
  UNION ALL SELECT * FROM public._run_invariant_checks_extrato()
  UNION ALL SELECT * FROM public._run_invariant_checks_cards()
  UNION ALL SELECT * FROM public._run_invariant_checks_tenant()
  UNION ALL SELECT * FROM public._run_invariant_checks_duplicate_invoices()
  UNION ALL SELECT * FROM public._run_invariant_checks_camarim()
  UNION ALL SELECT * FROM public._run_invariant_checks_suppliers()
  UNION ALL SELECT * FROM public._run_invariant_checks_paid_below_gross()
  UNION ALL SELECT * FROM public._run_invariant_checks_ticketline_series()
$function$;