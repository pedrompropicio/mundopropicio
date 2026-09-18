INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES (
  'linha_conciliada_sem_transacao',
  'Linhas de extrato com status=matched e sem nenhuma ligacao (transacao, transacao criada, lote SEPA, lista de pagamento ou ponte bank_line_transactions)',
  'error',
  'global',
  0,
  'Incidente de 18/09/2026: linha PAG SERVICOS AUDIOGEST de 16/09 conciliada com a transacao do Lancar desaparecida (modo de falha da #154). Semeada com 0 casos.'
)
ON CONFLICT (name) DO UPDATE
   SET description = EXCLUDED.description,
       severity = EXCLUDED.severity,
       scope = EXCLUDED.scope,
       reference_count = EXCLUDED.reference_count,
       notes = EXCLUDED.notes;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  cB bigint; sB jsonb;
  cX bigint; sX jsonb;
  cF bigint; sF jsonb;
  cP bigint; sP jsonb;
  cT bigint; sT jsonb;
  cL bigint; sL jsonb;
  cC bigint; sC jsonb;
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

  WITH falhados AS (
    SELECT l.template_name, l.recipient_email, l.status, l.error_message, l.created_at
      FROM public.email_send_log l
     WHERE l.status IN ('failed','dlq')
       AND l.created_at > now() - interval '24 hours'
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT template_name, recipient_email, status, error_message, created_at
                       FROM falhados ORDER BY created_at DESC LIMIT 6) x), '[]'::jsonb)
    INTO cF, sF FROM falhados;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cF, i.reference_count, (cF = i.reference_count) AS conforme,
         i.notes, sF
    FROM public.system_invariants i
   WHERE i.name = 'emails_falhados_24h';

  WITH presos AS (
    SELECT l.template_name, l.recipient_email, l.created_at
      FROM public.email_send_log l
     WHERE l.status = 'pending'
       AND l.created_at < now() - interval '24 hours'
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT template_name, count(*) AS total,
                            min(created_at) AS mais_antigo, max(created_at) AS mais_recente
                       FROM presos GROUP BY template_name ORDER BY count(*) DESC LIMIT 6) x), '[]'::jsonb)
    INTO cP, sP FROM presos;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cP, i.reference_count, (cP = i.reference_count) AS conforme,
         i.notes, sP
    FROM public.system_invariants i
   WHERE i.name = 'emails_presos_pending';

  WITH grandes AS (
    SELECT n.nspname AS esquema, c.relname AS tabela, c.reltuples::bigint AS linhas
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND n.nspname IN ('public','crm')
       AND c.reltuples > 1000
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT esquema, tabela, linhas FROM grandes
                      ORDER BY linhas DESC LIMIT 6) x), '[]'::jsonb)
    INTO cT, sT FROM grandes;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cT, i.reference_count, (cT = i.reference_count) AS conforme,
         i.notes, sT
    FROM public.system_invariants i
   WHERE i.name = 'tabelas_acima_de_1000';

  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, t.date, t.description,
           t.status, t.paid_amount,
           ROUND(s.soma, 2) AS soma_linhas,
           ROUND(COALESCE(t.paid_amount, 0) - s.soma, 2) AS diferenca
      FROM public.transactions t
      JOIN LATERAL (
        SELECT SUM(p.amount) AS soma
          FROM public.transaction_payments p
         WHERE p.transaction_id = t.id
           AND p.status = 'paid'
      ) s ON s.soma IS NOT NULL
     WHERE NOT (t.parent_transaction_id IS NOT NULL AND t.split_percentage IS NOT NULL)
       AND COALESCE(t.is_reimbursement, false) = false
       AND NOT EXISTS (
         SELECT 1 FROM public.partner_paid_expenses pp WHERE pp.transaction_id = t.id
       )
       AND abs(COALESCE(t.paid_amount, 0) - s.soma) > 0.05
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY abs(diferenca) DESC LIMIT 5) x), '[]'::jsonb)
    INTO cL, sL FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cL, i.reference_count, (cL = i.reference_count) AS conforme,
         i.notes, sL
    FROM public.system_invariants i
   WHERE i.name = 'paid_amount_sem_linhas';

  -- #189 / incidente de 18/09/2026: linha conciliada sem NENHUMA ligacao.
  WITH bad AS (
    SELECT l.id AS line_id, l.financial_account_id, l.statement_id,
           l.booking_date, l.description, l.amount, l.matched_by, l.matched_at
      FROM public.bank_statement_lines l
     WHERE l.status = 'matched'
       AND l.matched_transaction_id IS NULL
       AND l.created_transaction_id IS NULL
       AND l.matched_sepa_export_id IS NULL
       AND l.matched_payment_list_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.bank_line_transactions b WHERE b.line_id = l.id
       )
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY booking_date DESC LIMIT 6) x), '[]'::jsonb)
    INTO cC, sC FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cC, i.reference_count, (cC = i.reference_count) AS conforme,
         i.notes, sC
    FROM public.system_invariants i
   WHERE i.name = 'linha_conciliada_sem_transacao';
END;
$function$;

REVOKE ALL ON FUNCTION public._run_invariant_checks_extra() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_extra() TO service_role;