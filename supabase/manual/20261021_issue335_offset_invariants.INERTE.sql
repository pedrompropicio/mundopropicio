-- INERTE: no registration/application authorized in Live.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.issue335_invariant_counts()
RETURNS TABLE(name text,current_count bigint) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 WITH active AS(SELECT * FROM public.transaction_offset_groups WHERE status='applied'),
 totals AS(SELECT group_id,sum(CASE WHEN type='income' THEN open_amount ELSE -open_amount END) net,
 sum(CASE WHEN type='income' THEN compensation_amount ELSE -compensation_amount END) comp,sum(cash_amount) cash FROM public.transaction_offset_items GROUP BY group_id)
 SELECT 'encontro_desequilibrado',count(*) FROM active g LEFT JOIN totals t ON t.group_id=g.id WHERE t.net IS DISTINCT FROM g.movement_amount OR t.comp IS DISTINCT FROM 0::numeric OR t.cash IS DISTINCT FROM abs(g.movement_amount)
 UNION ALL SELECT 'encontro_pernas_divergentes',count(*) FROM public.transaction_offset_items i JOIN active g ON g.id=i.group_id WHERE
  i.cash_amount IS DISTINCT FROM COALESCE((SELECT sum(p.amount) FROM public.transaction_payments p WHERE p.offset_item_id=i.id AND p.payment_method='transfer' AND p.status='paid' AND p.reversed_at IS NULL),0) OR
  i.compensation_amount IS DISTINCT FROM COALESCE((SELECT sum(p.amount) FROM public.transaction_payments p WHERE p.offset_item_id=i.id AND p.payment_method='compensation' AND p.status='paid' AND p.reversed_at IS NULL),0)
 UNION ALL SELECT 'encontro_reversao_parcial',count(*) FROM public.transaction_offset_groups g WHERE (g.status='reversed' AND EXISTS(SELECT 1 FROM public.transaction_payments p WHERE p.offset_group_id=g.id AND (p.status<>'reversed' OR p.reversed_at IS NULL))) OR (g.status='applied' AND EXISTS(SELECT 1 FROM public.transaction_payments p WHERE p.offset_group_id=g.id AND (p.status<>'paid' OR p.reversed_at IS NOT NULL)))
 UNION ALL SELECT 'encontro_dinheiro_sem_conta',count(*) FROM public.transaction_payments p JOIN active g ON g.id=p.offset_group_id WHERE (p.payment_method='compensation' AND p.account_id IS NOT NULL) OR (p.payment_method='transfer' AND (p.account_id IS DISTINCT FROM g.account_id OR p.account_id IS NULL))
 UNION ALL SELECT 'encontro_vinculo_bancario_divergente',count(*) FROM active g LEFT JOIN public.bank_statement_lines b ON b.id=g.bank_line_id WHERE (g.bank_line_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.bank_statement_lines z WHERE z.offset_group_id=g.id)) AND (b.id IS NULL OR b.offset_group_id IS DISTINCT FROM g.id OR b.status<>'matched' OR b.amount<>g.movement_amount OR b.financial_account_id IS DISTINCT FROM g.account_id OR EXISTS(SELECT 1 FROM public.bank_line_transactions l WHERE l.line_id=b.id AND NOT EXISTS(SELECT 1 FROM public.transaction_offset_items i WHERE i.group_id=g.id AND i.transaction_id=l.transaction_id AND i.cash_amount>0)) OR EXISTS(SELECT 1 FROM public.transaction_offset_items i WHERE i.group_id=g.id AND i.cash_amount>0 AND NOT EXISTS(SELECT 1 FROM public.bank_line_transactions l WHERE l.line_id=b.id AND l.transaction_id=i.transaction_id)));
$$;
REVOKE ALL ON FUNCTION public.issue335_invariant_counts() FROM PUBLIC,anon,authenticated,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public.issue335_invariant_counts() TO service_role;
-- Registry records are additive and require separate authorization C.
INSERT INTO public.system_invariants(name,description,severity,scope,reference_count,notes)
SELECT name,name,'error','empresa',0,'#335 bilateral; local/inert candidate' FROM public.issue335_invariant_counts() ON CONFLICT(name) DO NOTHING;

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
  cM bigint; sM jsonb;
  cO bigint; sO jsonb;
  cS bigint; sS jsonb;
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
     WHERE l.status = 'pending' AND NOT EXISTS (SELECT 1 FROM public.email_send_log s WHERE s.message_id = l.message_id AND s.status = 'sent')
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
       AND c.relname <> ALL (ARRAY['transactions','ticket_sales','event_forecasts','transaction_documents','event_zone_capacities','bilheteira_zone_snapshots','leads','contacts','undo_actions','meta_audience_upload_members','meta_custom_audiences','user_activity_log','system_audit_log','transaction_audit_log','ticketline_sync_runs','bol_sync_runs','coala_sync_runs','fever_sync_runs','transaction_payments','bank_statement_lines','artist_content_metrics_daily','song_link_events','redirect_log','consent_log','google_click','meta_ad_insights_daily','artist_metrics_daily','song_link_diag','meta_ad_snapshot','tickets_v2_sync_log','ads_insights_breakdown_daily','meta_adset_insights_daily','meta_creatives','artist_audience_demographics','meta_creatives_retention_log','lead_capture','email_send_log','artist_content','artist_song_metrics_daily','meta_adset_snapshot','email_unsubscribe_tokens','portal_error_log','meta_campaign_insights_daily','artist_song_playlist_streams','event_forecast_formalidade_log','artist_release_metrics_daily','ip_geo_cache']::text[])
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT esquema, tabela, linhas FROM grandes
                      ORDER BY linhas DESC LIMIT 50) x), '[]'::jsonb)
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

  WITH bad AS (
    SELECT p.id AS payment_id, p.transaction_id, p.currency, p.amount,
           p.original_amount, p.fx_rate, p.payment_date
      FROM public.transaction_payments p
     WHERE COALESCE(p.currency, 'EUR') <> 'EUR'
       AND (p.original_amount IS NULL OR p.fx_rate IS NULL)
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY payment_date DESC LIMIT 6) x), '[]'::jsonb)
    INTO cM, sM FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cM, i.reference_count, (cM = i.reference_count) AS conforme,
         i.notes, sM
    FROM public.system_invariants i
   WHERE i.name = 'pagamento_moeda_sem_cambio';

  WITH bad AS (
    SELECT o.id AS offset_id, o.company_id, o.receivable_transaction_id, o.payable_transaction_id, o.amount
      FROM public.transaction_offsets o
     WHERE o.offset_group_id IS NULL AND ((
             EXISTS (SELECT 1 FROM public.transaction_payments x
                      WHERE x.transaction_id = o.receivable_transaction_id
                        AND x.payment_method <> 'compensation' AND x.status = 'paid' AND x.reversed_at IS NULL)
             AND NOT EXISTS (SELECT 1 FROM public.transaction_payments x
                      WHERE x.transaction_id = o.payable_transaction_id AND x.offset_id = o.id
                        AND x.status = 'paid' AND x.reversed_at IS NULL)
           ) OR (
             EXISTS (SELECT 1 FROM public.transaction_payments x
                      WHERE x.transaction_id = o.payable_transaction_id
                        AND x.payment_method <> 'compensation' AND x.status = 'paid' AND x.reversed_at IS NULL)
             AND NOT EXISTS (SELECT 1 FROM public.transaction_payments x
                      WHERE x.transaction_id = o.receivable_transaction_id AND x.offset_id = o.id
                        AND x.status = 'paid' AND x.reversed_at IS NULL)
           ))
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 6) x), '[]'::jsonb)
    INTO cO, sO FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cO, i.reference_count, (cO = i.reference_count) AS conforme,
         i.notes, sO
    FROM public.system_invariants i
   WHERE i.name = 'compensacao_pendente';
  -- D-ERP156: conta-corrente de sessão de camarim integrada tem de ficar a 0.
  WITH bad AS (
    SELECT s.id AS session_id, s.company_id, s.title, s.advance_account_id,
           round(public._account_true_balance_raw(s.advance_account_id), 2) AS saldo
      FROM public.camarim_sessions s
     WHERE s.status = 'integrated'
       AND s.advance_account_id IS NOT NULL
       AND abs(COALESCE(public._account_true_balance_raw(s.advance_account_id), 0)) >= 0.01
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 6) x), '[]'::jsonb)
    INTO cS, sS FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cS, i.reference_count, (cS = i.reference_count) AS conforme,
         i.notes, sS
    FROM public.system_invariants i
   WHERE i.name = 'camarim_sessao_integrada_com_saldo';
  RETURN QUERY SELECT i.name,i.description,i.severity,i.scope,c.current_count,i.reference_count,(c.current_count=i.reference_count),i.notes,'[]'::jsonb FROM public.issue335_invariant_counts() c JOIN public.system_invariants i ON i.name=c.name;
END;
$function$;

REVOKE ALL ON FUNCTION public._run_invariant_checks_extra() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_extra() TO service_role;
COMMIT;
