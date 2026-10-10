-- #53/#56: enqueue_email com company_id explícito (grava-o no payload).
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb, company_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF company_id IS NULL THEN
    RAISE EXCEPTION 'enqueue_email: company_id obrigatório (#53)';
  END IF;
  RETURN public.enqueue_email(queue_name, payload || jsonb_build_object('company_id', company_id));
END;
$function$;
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb, uuid) TO authenticated, service_role;

-- #57: view agregava dados de todas as empresas com direitos do dono e estava aberta a anon.
ALTER VIEW public.v_artist_audience_by_state SET (security_invoker = true);
REVOKE ALL ON public.v_artist_audience_by_state FROM anon;

-- #83 + #56: invariantes de isolamento.
CREATE OR REPLACE FUNCTION public._run_invariant_checks_isolation()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE cR bigint; sR jsonb; cN bigint; sN jsonb;
BEGIN
  WITH t AS (
    SELECT c.relname FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'company_id' AND NOT a.attisdropped
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
       AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND NOT p.polpermissive)
  )
  SELECT count(*), coalesce(jsonb_agg(relname ORDER BY relname), '[]'::jsonb) INTO cR, sR FROM t;

  SELECT
    (SELECT count(*) FROM public.lead_capture WHERE company_id IS NULL AND created_at > now() - interval '24 hours')
  + (SELECT count(*) FROM public.email_send_log WHERE company_id IS NULL AND created_at > now() - interval '24 hours'),
    jsonb_build_object(
      'lead_capture', (SELECT count(*) FROM public.lead_capture WHERE company_id IS NULL AND created_at > now() - interval '24 hours'),
      'email_send_log', (SELECT coalesce(jsonb_object_agg(template_name, n), '{}'::jsonb) FROM (
          SELECT template_name, count(*) n FROM public.email_send_log
           WHERE company_id IS NULL AND created_at > now() - interval '24 hours' GROUP BY 1) x))
  INTO cN, sN;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         CASE i.name WHEN 'tabelas_company_id_sem_restrictive' THEN cR ELSE cN END,
         i.reference_count,
         (CASE i.name WHEN 'tabelas_company_id_sem_restrictive' THEN cR ELSE cN END) <= i.reference_count,
         i.notes,
         CASE i.name WHEN 'tabelas_company_id_sem_restrictive' THEN sR ELSE sN END
    FROM public.system_invariants i
   WHERE i.name IN ('tabelas_company_id_sem_restrictive', 'company_id_nulo_email_lead_24h');
END;
$function$;
REVOKE ALL ON FUNCTION public._run_invariant_checks_isolation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_isolation() TO service_role;

INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES
 ('tabelas_company_id_sem_restrictive',
  'Tabelas em public com company_id e sem nenhuma política RESTRICTIVE. Subir acima da referência = tabela nova sem isolamento.',
  'warn', 'global', 52,
  '#83 — dívida aceite a 10/10/2026: 52 tabelas (config/sync/simulador/portal), todas com RLS ligada. Ver amostra.'),
 ('company_id_nulo_email_lead_24h',
  'Linhas criadas nas últimas 24h com company_id NULL em lead_capture ou email_send_log.',
  'error', 'global', 0,
  '#53/#56 — os produtores passam company_id; histórico nulo por decidir (sem backfill).')
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
  UNION ALL SELECT * FROM public._run_invariant_checks_unreachable_docs()
  UNION ALL SELECT * FROM public._run_invariant_checks_isolation()
$function$;