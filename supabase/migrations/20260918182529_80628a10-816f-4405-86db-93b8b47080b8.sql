-- #91 passo 3: paid_amount / status de pagamento / payment_date derivados no servidor.

ALTER TABLE public.transaction_payments
  ADD COLUMN IF NOT EXISTS closes_transaction boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.transaction_payments.closes_transaction IS
  'Linha que FECHA a transação mesmo sem a soma atingir o bruto em EUR. Só se usa em moeda estrangeira (variação cambial): ver sync_paid_amount_from_payments(). #91';

CREATE OR REPLACE FUNCTION public.sync_paid_amount_from_payments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id uuid;
  v_amount numeric;
  v_iva_rate numeric;
  v_status text;
  v_currency text;
  v_parent uuid;
  v_split numeric;
  v_reimb boolean;
  v_gross numeric;
  v_paid_sum numeric;
  v_max_paid_date date;
  v_closes boolean;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);

  SELECT t.amount, COALESCE(t.iva_rate, 0), t.status, COALESCE(t.currency, 'EUR'),
         t.parent_transaction_id, t.split_percentage, COALESCE(t.is_reimbursement, false)
    INTO v_amount, v_iva_rate, v_status, v_currency, v_parent, v_split, v_reimb
    FROM public.transactions t
   WHERE t.id = v_tx_id;

  IF v_amount IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ISENÇÕES (#91): transações em que o dinheiro NÃO sai por elas e por isso
  -- não têm (nem devem ter) linhas em transaction_payments.
  --   1) filha de rateio multi-evento: a saída é na mãe;
  --   2) linha de nota de reembolso: paga pela nota;
  --   3) despesa paga pelo sócio: sem saída de caixa da empresa.
  IF (v_parent IS NOT NULL AND v_split IS NOT NULL)
     OR v_reimb
     OR EXISTS (SELECT 1 FROM public.partner_paid_expenses p WHERE p.transaction_id = v_tx_id)
  THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_gross := v_amount * (1 + v_iva_rate / 100.0);

  SELECT COALESCE(SUM(p.amount), 0),
         MAX(p.payment_date),
         COALESCE(bool_or(COALESCE(p.closes_transaction, false)), false)
    INTO v_paid_sum, v_max_paid_date, v_closes
    FROM public.transaction_payments p
   WHERE p.transaction_id = v_tx_id
     AND p.status = 'paid';

  IF v_paid_sum <= 0.01 THEN
    -- Perder o pagamento não desaprova: uma transação aprovada continua aprovada
    -- (é o estado que os pickers das listas de pagamento exigem).
    UPDATE public.transactions
       SET paid_amount = 0,
           status = CASE WHEN v_status IN ('paid','partially_paid') THEN 'approved' ELSE v_status END,
           payment_date = NULL,
           updated_at = now()
     WHERE id = v_tx_id;
  ELSIF v_paid_sum >= v_gross - 0.05
        OR (v_currency <> 'EUR' AND v_closes) THEN
    -- Tolerância 0,05 € como o cliente (isFullyPaid). Em moeda estrangeira a
    -- soma em EUR pode não atingir o bruto original por variação cambial: a
    -- linha marcada closes_transaction fecha a transação.
    UPDATE public.transactions
       SET paid_amount = v_paid_sum,
           status = 'paid',
           payment_date = COALESCE(v_max_paid_date, CURRENT_DATE),
           updated_at = now()
     WHERE id = v_tx_id;
  ELSE
    UPDATE public.transactions
       SET paid_amount = v_paid_sum,
           status = 'approved',
           payment_date = NULL,
           updated_at = now()
     WHERE id = v_tx_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Verificação nova: paid_amount que não bate com a soma das linhas pagas.
-- Só conta transações que TÊM linhas (as que não têm são a verificação
-- tx_paga_sem_linha_de_pagamento, já existente).
INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES (
  'paid_amount_sem_linhas',
  'Transações não isentas com linhas de pagamento cujo paid_amount difere da soma das linhas pagas em mais de 0,05 €.',
  'error',
  'global',
  1,
  'Referência 1 a 18/09/2026: TX 31497cab-8123-4a5b-8ee3-0e13db8508c9 (Aluguel espaço), legado preservado por decisão. Isentas: filhas de rateio, notas de reembolso, pagas pelo sócio. #91'
)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      severity = EXCLUDED.severity,
      scope = EXCLUDED.scope,
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

  -- emails falhados nas últimas 24h
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

  -- emails presos em pending há mais de 24h
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

  -- tabelas base acima de 1.000 linhas (estimativa do planeador)
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

  -- #91: paid_amount tem de bater com a soma das linhas pagas.
  -- Isentas: filha de rateio, nota de reembolso, paga pelo sócio.
  -- Só conta quem TEM linhas (quem não tem é tx_paga_sem_linha_de_pagamento).
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
END;
$function$;

REVOKE ALL ON FUNCTION public._run_invariant_checks_extra() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_extra() TO service_role;