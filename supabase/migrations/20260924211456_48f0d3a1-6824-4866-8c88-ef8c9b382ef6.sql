-- Invariante erros_portal_24h — vigia os erros de front dos portais públicos.
-- Aplicado em Live a 24/09/2026; este ficheiro existe para reconstrução.
-- Semântica de limiar: reference_count é o MÁXIMO TOLERADO por dia, e
-- conforme = contagem <= referência (ao contrário dos invariantes de igualdade).

insert into public.system_invariants (name, description, severity, scope, reference_count, notes)
values (
  'erros_portal_24h',
  'Erros de front dos portais públicos registados nas últimas 24 horas',
  'error',
  'global',
  20,
  'ATENÇÃO à semântica: reference_count é o MÁXIMO TOLERADO por dia, não o valor esperado. Conforme = contagem <= referência. Fonte: public.portal_error_log. A 24/09/2026 um erro de validação na raiz do portal do Coala pôs o ecrã "Algo correu mal" a 100% do tráfego pago da Meta durante dois dias, com 1.728 ocorrências num só dia, e ninguém foi avisado — ver D-ERP142 e Issue #253. O alarme rápido (de hora a hora) vive numa tarefa agendada; este invariante é a rede de segurança diária.'
)
on conflict (name) do update set
  description = excluded.description,
  severity = excluded.severity,
  scope = excluded.scope,
  reference_count = excluded.reference_count,
  notes = excluded.notes,
  updated_at = now();

CREATE OR REPLACE FUNCTION public._run_invariant_checks_infra()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  cR bigint; sR jsonb;
  cP bigint; sP jsonb;
BEGIN
  -- Purga do histórico de execuções do cron
  SELECT count(*) INTO cR
    FROM cron.job_run_details d
   WHERE d.end_time < now() - interval '8 days';

  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO sR
    FROM (
      SELECT d.jobid, d.runid, d.status, d.end_time
        FROM cron.job_run_details d
       WHERE d.end_time < now() - interval '8 days'
       ORDER BY d.end_time
       LIMIT 5
    ) x;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cR, i.reference_count, (cR = i.reference_count) AS conforme,
         i.notes, sR
    FROM public.system_invariants i
   WHERE i.name = 'cron_run_details_sem_purga';

  -- Erros de front dos portais públicos nas últimas 24 horas.
  -- Semântica de limiar: conforme = contagem <= referência (máximo tolerado).
  SELECT count(*) INTO cP
    FROM public.portal_error_log l
   WHERE l.created_at > now() - interval '24 hours';

  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO sP
    FROM (
      SELECT left(regexp_replace(l.message, '\s+', ' ', 'g'), 160) AS mensagem,
             l.route,
             count(*) AS n,
             max(l.created_at) AS ultimo
        FROM public.portal_error_log l
       WHERE l.created_at > now() - interval '24 hours'
       GROUP BY 1, 2
       ORDER BY count(*) DESC
       LIMIT 3
    ) x;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cP, i.reference_count, (cP <= i.reference_count) AS conforme,
         i.notes, sP
    FROM public.system_invariants i
   WHERE i.name = 'erros_portal_24h';
END;
$function$;