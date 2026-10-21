-- Live _account_true_balance_raw (catalog SELECT; whitespace-compacted body, same predicates).
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS initial_balance numeric, ADD COLUMN IF NOT EXISTS initial_balance_date date;
ALTER TABLE public.transaction_payments ADD COLUMN IF NOT EXISTS withholding_amount numeric, ADD COLUMN IF NOT EXISTS credit_amount numeric;
CREATE OR REPLACE FUNCTION public._account_true_balance_raw(_account_id uuid)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH acc AS (SELECT id, COALESCE(initial_balance, 0) AS initial_balance, initial_balance_date FROM public.financial_accounts WHERE id = _account_id),
  mov AS (SELECT COALESCE(SUM(CASE WHEN t.type = 'income' THEN COALESCE(t.paid_amount, 0) ELSE -COALESCE(t.paid_amount, 0) END), 0) AS total
    FROM public.transactions t, acc WHERE t.account_id = acc.id
      AND (acc.initial_balance_date IS NULL OR COALESCE(t.payment_date, t.date) IS NULL OR COALESCE(t.payment_date, t.date) > acc.initial_balance_date)),
  adj AS (SELECT COALESCE(SUM(COALESCE(p.withholding_amount, 0) + COALESCE(p.credit_amount, 0)), 0) AS total
    FROM public.transaction_payments p, acc WHERE p.account_id = acc.id AND p.status = 'paid' AND p.reversed_at IS NULL
      AND (acc.initial_balance_date IS NULL OR p.payment_date IS NULL OR p.payment_date > acc.initial_balance_date))
  SELECT acc.initial_balance + mov.total + adj.total FROM acc, mov, adj;
$function$;
REVOKE ALL ON FUNCTION public._account_true_balance_raw(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._account_true_balance_raw(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_dre_nature()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  WITH bad AS (
    SELECT t.id, t.company_id, t.type AS tx_type, cat.type AS cat_type, cat.code,
           t.amount, extract(year FROM COALESCE(t.payment_date, t.date))::int AS ano
      FROM public.transactions t
      JOIN public.account_categories cat ON cat.id = t.category_id
     WHERE t.status IN ('approved', 'paid')
       AND t.reversed_at IS NULL
       AND NOT COALESCE(t.is_hidden, false)
       AND NOT COALESCE(t.is_transitory, false)
       AND NOT COALESCE(t.exclude_from_result, false)
       AND cat.code LIKE '10%'
       AND t.type <> cat.type
       AND NOT (t.type = 'income' AND cat.code = '10.6.03')
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(jsonb_build_object('ano', y.ano, 'company_id', y.company_id, 'tx_type', y.tx_type,
                                                       'rubrica_tipo', y.cat_type, 'n', y.n, 'valor', round(y.v, 2))
                                    ORDER BY y.ano, y.company_id, y.tx_type)
                     FROM (SELECT ano, company_id, tx_type, cat_type, count(*) n, sum(amount) v
                             FROM bad GROUP BY 1, 2, 3, 4) y), '[]'::jsonb)
    INTO c, s FROM bad;
  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, i.reference_count, c <= i.reference_count, i.notes, s
    FROM public.system_invariants i WHERE i.name = 'transacoes_natureza_divergente_da_rubrica';
END $function$;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_rateio()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  WITH m AS (
    SELECT p.id AS m_id, p.description AS m_desc, p.amount AS m_amount, sum(ch.amount) AS m_soma, count(*) AS m_n
      FROM public.transactions p
      JOIN public.transactions ch ON ch.parent_transaction_id = p.id AND ch.split_percentage IS NOT NULL
     GROUP BY p.id, p.description, p.amount
    HAVING abs(p.amount - sum(ch.amount)) > 0.01
  )
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', m.m_id, 'descricao', m.m_desc, 'mae', m.m_amount, 'filhas', m.m_soma, 'n', m.m_n, 'diff', m.m_amount - m.m_soma) ORDER BY abs(m.m_amount - m.m_soma) DESC), '[]'::jsonb)
    INTO c, s FROM m;
  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, i.reference_count, c <= i.reference_count, i.notes, s
    FROM public.system_invariants i WHERE i.name = 'maes_rateio_divergentes';
END $function$;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_raw()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  c1 bigint; c2 bigint; c3 bigint; c4 bigint; c5 bigint; c6 bigint;
  c7 bigint; c8 bigint; c9 bigint; c10 bigint; c12 bigint;
  c13 bigint; c14 bigint; c15 bigint; c16 bigint; c17 bigint; c18 bigint;
  c19 bigint; c20 bigint; c21 bigint; c22 bigint;
  s1 jsonb; s2 jsonb; s3 jsonb; s4 jsonb; s5 jsonb; s6 jsonb;
  s7 jsonb; s8 jsonb; s9 jsonb; s10 jsonb; s12 jsonb;
  s13 jsonb; s14 jsonb; s15 jsonb; s16 jsonb; s17 jsonb; s18 jsonb;
  s19 jsonb; s20 jsonb; s21 jsonb; s22 jsonb;
BEGIN
  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.company_id AS tx_company, s.company_id AS supplier_company, s.name AS supplier_name
      FROM public.transactions t
      JOIN public.suppliers s ON s.id = t.supplier_id
     WHERE t.company_id IS DISTINCT FROM s.company_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c1, s1 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.company_id AS tx_company, a.company_id AS account_company, a.name AS account_name
      FROM public.transactions t
      JOIN public.financial_accounts a ON a.id = t.account_id
     WHERE t.company_id IS DISTINCT FROM a.company_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c2, s2 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.company_id AS tx_company, e.company_id AS event_company, e.name AS event_name
      FROM public.transactions t
      JOIN public.events e ON e.id = t.event_id
     WHERE t.company_id IS DISTINCT FROM e.company_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c3, s3 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.company_id AS tx_company, c.company_id AS category_company, c.code AS category_code
      FROM public.transactions t
      JOIN public.account_categories c ON c.id = t.category_id
     WHERE c.company_id IS NOT NULL
       AND t.company_id IS DISTINCT FROM c.company_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c4, s4 FROM bad;

  WITH bad AS (
    SELECT x.id AS map_id, x.company_id AS map_company, s.company_id AS supplier_company, s.name AS supplier_name
      FROM public.coala_supplier_category_map x
      JOIN public.suppliers s ON s.id = x.supplier_id
     WHERE x.company_id IS DISTINCT FROM s.company_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(y)) FROM (SELECT * FROM bad LIMIT 5) y), '[]'::jsonb)
    INTO c5, s5 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.parent_transaction_id, t.account_id, t.company_id
      FROM public.transactions t
     WHERE t.parent_transaction_id IS NOT NULL
       AND t.installment_group_id IS NULL
       AND t.account_id IS NOT NULL
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c6, s6 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.type, t.company_id
      FROM public.transactions t
     WHERE t.type NOT IN ('income','expense')
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c7, s7 FROM bad;

  WITH bad AS (
    SELECT s.company_id, s.iban, count(*) AS fornecedores, string_agg(s.name, ' | ') AS nomes
      FROM public.suppliers s
     WHERE s.is_active AND s.iban IS NOT NULL AND s.iban <> ''
     GROUP BY s.company_id, s.iban
    HAVING count(*) > 1
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c8, s8 FROM bad;

  WITH bad AS (
    SELECT t.id AS settlement_id, t.event_id, t.net_calculated, t.net_adjusted, t.net_transferred
      FROM public.ticket_office_settlements t
     WHERE t.status = 'confirmed'
       AND COALESCE(t.net_transferred, 0) = 0
       AND COALESCE(t.net_adjusted, t.net_calculated) > 0.01
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c9, s9 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.amount, t.iva_rate, t.paid_amount, t.company_id
      FROM public.transactions t
     WHERE t.paid_amount IS NOT NULL
       AND t.paid_amount > ROUND(t.amount * (1 + COALESCE(t.iva_rate,0)/100.0), 2) + 0.02
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c10, s10 FROM bad;

  WITH bad AS (
    SELECT con.conrelid::regclass::text AS tabela, con.confrelid::regclass::text AS referenciada, count(*) AS fks
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
     WHERE con.contype = 'f' AND nsp.nspname = 'public'
     GROUP BY 1, 2
    HAVING count(*) > 1
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY fks DESC, tabela LIMIT 5) x), '[]'::jsonb)
    INTO c12, s12 FROM bad;

  WITH bad AS (
    SELECT f.id AS forecast_id, f.company_id, f.event_id, f.description, c.code AS category_code
      FROM public.event_forecasts f
      JOIN public.account_categories c ON c.id = f.category_id
     WHERE f.type = 'expense'
       AND f.version_id IS NULL
       AND EXISTS (SELECT 1 FROM public.account_categories k WHERE k.parent_id = c.id)
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c13, s13 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, t.event_id, t.description
      FROM public.transactions t
     WHERE t.event_id IS NOT NULL AND t.category_id IS NULL
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c14, s14 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, t.event_id AS tx_event, f.event_id AS forecast_event, t.description
      FROM public.transactions t
      JOIN public.event_forecasts f ON f.id = t.forecast_id
     WHERE t.event_id IS NOT NULL AND t.event_id IS DISTINCT FROM f.event_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c15, s15 FROM bad;

  WITH bad AS (
    SELECT f.id AS forecast_id, f.company_id, f.event_id, f.description,
           t.id AS anchor_transaction_id, t.forecast_id AS tx_forecast_id
      FROM public.event_forecasts f
      JOIN public.transactions t ON t.id = f.transaction_id
     WHERE f.version_id IS NULL AND t.forecast_id IS DISTINCT FROM f.id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c16, s16 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, t.forecast_id, t.event_id, t.description
      FROM public.transactions t
     WHERE t.forecast_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.event_forecasts f WHERE f.id = t.forecast_id)
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c17, s17 FROM bad;

  WITH bad AS (
    SELECT p.proname AS function_name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prorettype = 'trigger'::regtype
       AND NOT EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgfoid = p.oid AND NOT tg.tgisinternal)
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY function_name LIMIT 5) x), '[]'::jsonb)
    INTO c18, s18 FROM bad;

  WITH bad AS (
    SELECT a.invoice_group_id,
           max(a.run_at) AS ultimo_run_at,
           count(*) AS linhas_auditadas,
           (SELECT count(*) FROM public.transactions t WHERE t.invoice_group_id = a.invoice_group_id) AS transacoes_agrupadas
      FROM public.invoice_group_audit a
     WHERE a.veredicto = 'desagrupar'
       AND a.aplicado = false
       AND a.invoice_group_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.transactions t WHERE t.invoice_group_id = a.invoice_group_id)
     GROUP BY a.invoice_group_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY ultimo_run_at DESC LIMIT 5) x), '[]'::jsonb)
    INTO c19, s19 FROM bad;

  -- D-ERP70: a mae do rateio e a fatura inteira; as filhas sao a decomposicao por evento.
  -- Soma das filhas <> valor da mae => valor sem evento atribuido, invisivel no DRE de evento.
  -- Exclui parcelas de pagamento (installment_group_id preenchido).
  WITH bad AS (
    SELECT m.id AS mae_transaction_id, m.company_id, m.date, m.description, m.invoice_ref,
           m.amount AS valor_mae,
           ROUND(f.soma, 2) AS soma_filhas,
           f.n_filhas,
           ROUND(m.amount - f.soma, 2) AS diferenca,
           ROUND((m.amount * (1 + COALESCE(m.iva_rate,0) / 100.0))::numeric, 2) AS bruto_mae,
           f.soma_bruto AS soma_bruto_filhas
      FROM public.transactions m
      JOIN LATERAL (
        SELECT SUM(c.amount) AS soma, count(*) AS n_filhas,
               SUM(ROUND((c.amount * (1 + COALESCE(c.iva_rate,0) / 100.0))::numeric, 2)) AS soma_bruto
          FROM public.transactions c
         WHERE c.parent_transaction_id = m.id
           AND c.installment_group_id IS NULL
      ) f ON f.n_filhas > 0
     WHERE m.parent_transaction_id IS NULL
       AND (abs(m.amount - f.soma) > 0.05
            -- #285 (09/10/2026): também acende quando o BRUTO não bate (IVA divergente mãe/filhas).
            OR abs(ROUND((m.amount * (1 + COALESCE(m.iva_rate,0) / 100.0))::numeric, 2) - f.soma_bruto) > 0.05)
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY abs(diferenca) DESC LIMIT 5) x), '[]'::jsonb)
    INTO c20, s20 FROM bad;

  -- D-ERP80: a transitoria diz porque. Extra do Socio declarado tem de ter linha em partner_advance_expenses.
  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, t.event_id, t.date, t.description, t.amount
      FROM public.transactions t
     WHERE t.is_transitory
       AND t.transitory_reason = 'partner_advance'
       AND NOT EXISTS (SELECT 1 FROM public.partner_advance_expenses p WHERE p.transaction_id = t.id)
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY amount DESC LIMIT 5) x), '[]'::jsonb)
    INTO c21, s21 FROM bad;

  -- #201: carga de cartao marcada como paga (marca visual) e ainda sem perna de
  -- entrada. O trigger card_load_on_out_paid so dispara com status='paid', logo a
  -- marca visual deixa dinheiro real no cartao e zero credito no sistema.
  WITH bad AS (
    SELECT l.id AS load_id, l.session_id, l.load_date, l.amount,
           l.out_transaction_id, t.company_id, t.status AS out_status
      FROM public.card_session_loads l
      JOIN public.transactions t ON t.id = l.out_transaction_id
     WHERE l.in_transaction_id IS NULL
       AND t.status <> 'paid'
       AND EXISTS (
         SELECT 1 FROM public.payment_list_items pli
          WHERE pli.transaction_id = t.id
            AND pli.manually_marked_paid
            AND pli.removed_at IS NULL
       )
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY load_date DESC LIMIT 5) x), '[]'::jsonb)
    INTO c22, s22 FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         v.cnt, i.reference_count, (v.cnt = i.reference_count) AS conforme,
         i.notes, v.smp
    FROM public.system_invariants i
    JOIN (VALUES
      ('tx_fornecedor_outra_empresa', c1, s1),
      ('tx_conta_outra_empresa', c2, s2),
      ('tx_evento_outra_empresa', c3, s3),
      ('tx_rubrica_outra_empresa', c4, s4),
      ('coala_map_outra_empresa', c5, s5),
      ('filha_rateio_com_conta', c6, s6),
      ('tipo_invalido', c7, s7),
      ('fornecedor_iban_duplicado_ativo', c8, s8),
      ('fecho_confirmado_liquido_retido', c9, s9),
      ('paid_amount_acima_do_bruto', c10, s10),
      ('pares_fk_duplicada', c12, s12),
      ('BP_DESPESA_EM_L2', c13, s13),
      ('TX_EVENTO_SEM_RUBRICA', c14, s14),
      ('VINCULO_CROSS_EVENTO', c15, s15),
      ('VINCULO_DESSINCRONIZADO', c16, s16),
      ('FORECAST_ID_ORFAO', c17, s17),
      ('TRIGGER_DOCUMENTADO_SEM_LIGACAO', c18, s18),
      ('grupo_fatura_veredicto_desagrupar_por_aplicar', c19, s19),
      ('rateio_filhas_nao_somam_a_mae', c20, s20),
      ('transitoria_partner_advance_sem_linha', c21, s21),
      ('carga_sem_credito', c22, s22)
    ) AS v(name, cnt, smp) ON v.name = i.name
   ORDER BY i.scope, (v.cnt = i.reference_count), i.severity, i.name;
END;
$function$;
-- LOCAL ONLY: installed invariant functions + local registry baseline (reference zero in fixture).
CREATE OR REPLACE FUNCTION public._run_invariant_checks_paid()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE cZ bigint; sZ jsonb;
BEGIN
  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, t.date, t.description,
           t.status, t.paid_amount, t.account_id
      FROM public.transactions t
     WHERE COALESCE(t.paid_amount, 0) > 0.01
       AND COALESCE(t.is_reimbursement, false) = false
       AND NOT (t.parent_transaction_id IS NOT NULL AND t.split_percentage IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.partner_paid_expenses pp WHERE pp.transaction_id = t.id)
       AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p
                        WHERE p.transaction_id = t.id AND p.status = 'paid')
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY paid_amount DESC LIMIT 6) x), '[]'::jsonb)
    INTO cZ, sZ FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cZ, i.reference_count, (cZ = i.reference_count) AS conforme,
         i.notes, sZ
    FROM public.system_invariants i
   WHERE i.name = 'paid_sem_pagamento';
END;
$function$;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_paid_below_gross()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE cZ bigint; sZ jsonb;
BEGIN
  -- #285: /100.0 obrigatório (iva_rate é integer). Tolerância 0,02 obrigatória (arredondamento do bruto).
  WITH bad AS (
    SELECT t.id, t.company_id, t.description, t.date, t.amount, t.iva_rate, t.paid_amount,
           round((t.amount * (1 + COALESCE(t.iva_rate,0) / 100.0))::numeric, 2) - COALESCE(t.paid_amount,0) AS falta
      FROM public.transactions t
     WHERE t.status = 'paid' AND t.reversed_at IS NULL
       AND round((t.amount * (1 + COALESCE(t.iva_rate,0) / 100.0))::numeric, 2) - COALESCE(t.paid_amount,0) > 0.02
       AND COALESCE(t.declared_withholding_amount,0) = 0
       AND NOT EXISTS (SELECT 1 FROM public.supplier_credit_usages u WHERE u.transaction_id = t.id)
       AND NOT EXISTS (SELECT 1 FROM public.transaction_offsets o
                        WHERE t.id IN (o.receivable_transaction_id, o.payable_transaction_id))
       AND NOT EXISTS (SELECT 1 FROM public.ticket_office_settlements s
                        WHERE s.venue_retained_invoice_id = t.id AND s.reversed_at IS NULL)
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY falta DESC LIMIT 5) x), '[]'::jsonb)
    INTO cZ, sZ FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, cZ, i.reference_count,
         (cZ = i.reference_count) AS conforme, i.notes, sZ
    FROM public.system_invariants i WHERE i.name = 'pago_abaixo_do_bruto';
END;
$function$;
INSERT INTO public.system_invariants(name,description,severity,scope,reference_count,notes) VALUES ('backup_empresa_em_falta','backup_empresa_em_falta','error','empresa',0,'local'),('backup_tabelas_excluidas','backup_tabelas_excluidas','error','empresa',0,'local'),('emails_falhados_24h','emails_falhados_24h','error','empresa',0,'local'),('emails_presos_pending','emails_presos_pending','error','empresa',0,'local'),('tabelas_acima_de_1000','tabelas_acima_de_1000','error','empresa',0,'local'),('paid_amount_sem_linhas','paid_amount_sem_linhas','error','empresa',0,'local'),('linha_conciliada_sem_transacao','linha_conciliada_sem_transacao','error','empresa',0,'local'),('pagamento_moeda_sem_cambio','pagamento_moeda_sem_cambio','error','empresa',0,'local'),('compensacao_pendente','compensacao_pendente','error','empresa',0,'local'),('camarim_sessao_integrada_com_saldo','camarim_sessao_integrada_com_saldo','error','empresa',0,'local'),('paid_sem_pagamento','paid_sem_pagamento','error','empresa',0,'local'),('pago_abaixo_do_bruto','pagamento_abaixo_do_bruto','error','empresa',0,'local') ON CONFLICT(name) DO NOTHING;
ALTER FUNCTION public._run_invariant_checks_dre_nature() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._run_invariant_checks_dre_nature() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_dre_nature() TO service_role;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_dre_nature() TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public._run_invariant_checks_paid() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._run_invariant_checks_paid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_paid() TO service_role;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_paid() TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public._run_invariant_checks_paid_below_gross() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._run_invariant_checks_paid_below_gross() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_paid_below_gross() TO service_role;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_paid_below_gross() TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public._run_invariant_checks_rateio() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._run_invariant_checks_rateio() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_rateio() TO service_role;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_rateio() TO sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER FUNCTION public._run_invariant_checks_raw() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._run_invariant_checks_raw() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_raw() TO service_role;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_raw() TO sandbox_exec_sfohvvlqccmmebvjgibx;
