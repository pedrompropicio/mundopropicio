INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES (
  'carga_sem_credito',
  'Carga de cartão marcada como paga (marca visual) e ainda sem perna de entrada — cartão sem crédito no sistema',
  'error',
  'global',
  0,
  'Issue #201. O trigger card_load_on_out_paid só cria a entrada quando a saída passa a status=paid; "Marcar como Pago" é estritamente visual (#200) e não muda o status. Por isso nas cargas liquida-se, nunca se marca como pago — a UI deixou de oferecer a marca nas cargas a 17/09/2026. Semeada a 17/09/2026 com 0 casos.'
)
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_card_session_load(
  p_session_id uuid,
  p_amount numeric,
  p_load_date date,
  p_source_account_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_sess public.card_sessions%ROWTYPE;
  v_src_name TEXT;
  v_card_name TEXT;
  v_cat_id UUID;
  v_out_id UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor da carga inválido.';
  END IF;
  IF p_source_account_id IS NULL THEN
    RAISE EXCEPTION 'Conta de origem obrigatória.';
  END IF;

  SELECT * INTO v_sess FROM public.card_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão de cartão não encontrada.';
  END IF;
  IF v_sess.status = 'closed' THEN
    RAISE EXCEPTION 'Sessão fechada: não aceita novas recargas.';
  END IF;

  SELECT name INTO v_src_name  FROM public.financial_accounts WHERE id = p_source_account_id;
  SELECT name INTO v_card_name FROM public.financial_accounts WHERE id = v_sess.card_account_id;

  SELECT id INTO v_cat_id
    FROM public.account_categories
   WHERE code = '10.3'
     AND (company_id IS NULL OR company_id = v_sess.company_id)
   ORDER BY (company_id IS NULL)
   LIMIT 1;
  IF v_cat_id IS NULL THEN
    RAISE EXCEPTION 'Rubrica 10.3 (transferências entre contas) não encontrada.';
  END IF;

  INSERT INTO public.transactions (
    company_id, type, description, amount, iva_rate, date, status,
    is_transitory, transitory_reason, exclude_from_result, category_id, account_id
  ) VALUES (
    v_sess.company_id, 'expense',
    'Carga cartão — ' || COALESCE(v_card_name, 'cartão') || ' (' || COALESCE(v_src_name, 'origem') || ' → ' || COALESCE(v_card_name, 'cartão') || ')',
    p_amount, 0, p_load_date, 'pending',
    true, 'carga_cartao', true, v_cat_id, p_source_account_id
  )
  RETURNING id INTO v_out_id;

  INSERT INTO public.card_session_loads (
    session_id, amount, load_date, source_account_id,
    out_transaction_id, in_transaction_id, notes, created_by
  ) VALUES (
    p_session_id, p_amount, p_load_date, p_source_account_id,
    v_out_id, NULL, NULLIF(btrim(COALESCE(p_notes, '')), ''), auth.uid()
  );

  RETURN v_out_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_card_session_load(uuid, numeric, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_card_session_load(uuid, numeric, date, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_raw()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  c1 bigint; c2 bigint; c3 bigint; c4 bigint; c5 bigint; c6 bigint;
  c7 bigint; c8 bigint; c9 bigint; c10 bigint; c11 bigint; c12 bigint;
  c13 bigint; c14 bigint; c15 bigint; c16 bigint; c17 bigint; c18 bigint;
  c19 bigint; c20 bigint; c21 bigint; c22 bigint;
  s1 jsonb; s2 jsonb; s3 jsonb; s4 jsonb; s5 jsonb; s6 jsonb;
  s7 jsonb; s8 jsonb; s9 jsonb; s10 jsonb; s11 jsonb; s12 jsonb;
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
    SELECT t.id AS transaction_id, t.description, t.paid_amount, t.payment_date, t.company_id
      FROM public.transactions t
     WHERE t.status = 'paid'
       AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = t.id)
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c11, s11 FROM bad;

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
           ROUND(m.amount - f.soma, 2) AS diferenca
      FROM public.transactions m
      JOIN LATERAL (
        SELECT SUM(c.amount) AS soma, count(*) AS n_filhas
          FROM public.transactions c
         WHERE c.parent_transaction_id = m.id
           AND c.installment_group_id IS NULL
      ) f ON f.n_filhas > 0
     WHERE m.parent_transaction_id IS NULL
       AND abs(m.amount - f.soma) > 0.05
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
      ('tx_paga_sem_linha_de_pagamento', c11, s11),
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