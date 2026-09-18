-- Prova do lançamento atómico a partir do banco (issue #154, 18/09/2026).
-- A RPC public.launch_from_bank_lines cria as transações E liga as linhas no
-- mesmo commit. Três casos: caminho feliz, duplo clique, linha inexistente.
-- Corre em Live: tudo dentro de BEGIN … ROLLBACK, não deixa dados.
--
-- As duas linhas do extrato usadas na prova são criadas AQUI (clonadas de uma
-- linha real da empresa, status 'unmatched', line_hash aleatório) — a base
-- pode não ter linhas por conciliar no momento em que se corre.
--
-- A RPC NÃO é SECURITY DEFINER e usa public.current_company_id(); num SQL
-- direto sem utilizador autenticado a empresa activa vem NULL. Em psql/SQL
-- editor, fixar o utilizador antes do bloco:
--   select set_config('request.jwt.claims','{"sub":"<user_id>","role":"authenticated"}',true);

BEGIN;

DO $$
DECLARE
  v_company uuid;
  v_src public.bank_statement_lines;
  v_l1 uuid := gen_random_uuid();
  v_l2 uuid := gen_random_uuid();
  v_ids uuid[];
  v_before bigint;
  v_after bigint;
  v_matched int;
  v_cat uuid;
  v_items jsonb;
  v_err text;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE NOTICE 'SKIP: sem empresa activa neste contexto — correr com sessão autenticada.';
    RETURN;
  END IF;

  -- Linha real da empresa, só para herdar extrato e conta.
  SELECT * INTO v_src FROM public.bank_statement_lines
   WHERE company_id = v_company
   ORDER BY booking_date DESC LIMIT 1;

  IF v_src.id IS NULL THEN
    RAISE NOTICE 'SKIP: a empresa não tem nenhuma linha de extrato para clonar.';
    RETURN;
  END IF;

  INSERT INTO public.bank_statement_lines
    (id, company_id, statement_id, financial_account_id, booking_date, value_date,
     description, amount, status, line_hash)
  VALUES
    (v_l1, v_company, v_src.statement_id, v_src.financial_account_id, CURRENT_DATE, CURRENT_DATE,
     'PROVA 154 A', -10.00, 'unmatched', 'prova154-' || gen_random_uuid()::text),
    (v_l2, v_company, v_src.statement_id, v_src.financial_account_id, CURRENT_DATE, CURRENT_DATE,
     'PROVA 154 B', -15.00, 'unmatched', 'prova154-' || gen_random_uuid()::text);

  SELECT id INTO v_cat FROM public.account_categories
   WHERE company_id = v_company AND code = '10.6.01' LIMIT 1;

  SELECT count(*) INTO v_before FROM public.transactions WHERE company_id = v_company;

  v_items := jsonb_build_array(jsonb_build_object(
    'transaction', jsonb_build_object(
      'description', 'PROVA #154 — lançamento atómico',
      'type', 'expense',
      'amount', 25.00,
      'iva_rate', 0,
      'category_id', v_cat,
      'account_id', v_src.financial_account_id,
      'date', CURRENT_DATE,
      'status', 'paid',
      'paid_amount', 25.00,
      'payment_date', CURRENT_DATE
    ),
    'line_ids', jsonb_build_array(v_l1::text, v_l2::text),
    'matched_by', 'created:prova-154',
    'note', 'prova #154'
  ));

  -- (i) caminho feliz -------------------------------------------------------
  v_ids := public.launch_from_bank_lines(v_items);

  IF array_length(v_ids, 1) <> 1 THEN
    RAISE EXCEPTION 'FALHOU (i): esperava 1 transação, veio %.', array_length(v_ids, 1);
  END IF;

  SELECT count(*) INTO v_after FROM public.transactions WHERE company_id = v_company;
  IF v_after <> v_before + 1 THEN
    RAISE EXCEPTION 'FALHOU (i): contagem de transações passou de % para %.', v_before, v_after;
  END IF;

  SELECT count(*) INTO v_matched
    FROM public.bank_statement_lines
   WHERE id IN (v_l1, v_l2)
     AND status = 'matched'
     AND created_transaction_id = v_ids[1]
     AND matched_transaction_id = v_ids[1];
  IF v_matched <> 2 THEN
    RAISE EXCEPTION 'FALHOU (i): só % de 2 linhas ficaram matched na transação criada.', v_matched;
  END IF;

  RAISE NOTICE 'OK (i): 1 transação (%) pela soma de 25,00 € e as 2 linhas ficaram matched.', v_ids[1];

  -- (ii) duplo clique: as mesmas linhas já estão conciliadas ----------------
  v_before := v_after;
  BEGIN
    v_ids := public.launch_from_bank_lines(v_items);
    RAISE EXCEPTION 'FALHOU (ii): a segunda tentativa passou — devia recusar.';
  EXCEPTION WHEN raise_exception THEN
    v_err := SQLERRM;
    IF v_err LIKE 'FALHOU%' THEN RAISE; END IF;
    IF position('já está conciliada' in v_err) = 0 THEN
      RAISE EXCEPTION 'FALHOU (ii): recusou com a mensagem errada: %', v_err;
    END IF;
  END;

  SELECT count(*) INTO v_after FROM public.transactions WHERE company_id = v_company;
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'FALHOU (ii): criou transações na segunda tentativa (% → %).', v_before, v_after;
  END IF;
  RAISE NOTICE 'OK (ii): segunda tentativa recusada ("%"), contagem intacta.', v_err;

  -- (iii) linha inexistente -------------------------------------------------
  v_items := jsonb_set(v_items, '{0,line_ids}', jsonb_build_array(gen_random_uuid()::text));
  BEGIN
    v_ids := public.launch_from_bank_lines(v_items);
    RAISE EXCEPTION 'FALHOU (iii): aceitou uma linha inexistente.';
  EXCEPTION WHEN raise_exception THEN
    v_err := SQLERRM;
    IF v_err LIKE 'FALHOU%' THEN RAISE; END IF;
    IF position('inexistente' in v_err) = 0 THEN
      RAISE EXCEPTION 'FALHOU (iii): recusou com a mensagem errada: %', v_err;
    END IF;
  END;

  SELECT count(*) INTO v_after FROM public.transactions WHERE company_id = v_company;
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'FALHOU (iii): criou transações com linha inexistente (% → %).', v_before, v_after;
  END IF;
  RAISE NOTICE 'OK (iii): linha inexistente recusada ("%"), zero transações criadas.', v_err;
END $$;

ROLLBACK;
