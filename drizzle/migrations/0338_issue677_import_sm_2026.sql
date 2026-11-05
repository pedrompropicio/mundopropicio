-- #677 E2b · autorização 6644156767; decisões 6656184625 (1B/2A).
-- R2 PREPARADA, NÃO APLICADA. Sem dados, sem BEGIN/COMMIT exterior.
-- Aplicação exclusivamente pelo 0 na janela autorizada. Mapas e staging vêm de fora do repo.
-- Contrato dos formatos: datas YYYY-MM-DD (omissão), DD/MM/YYYY ou MM/DD/YYYY;
-- amount: '.' / decimal_dot (omissão), ',' / decimal_comma; agrupamento de milhares
-- só em grupos de três, até duas casas decimais. Não aceita moeda, expoente ou arredondamento.
-- direction, quando mapeada: valores literais income/expense; sem esse papel, usa o sinal.
-- payment_date preenchida significa pagamento integral; vazia significa por pagar.
-- event ausente/vazio exige event_map.legacy_event = '' com no_event = true.
-- Chaves são literais (apenas btrim), preservando zeros, ordem e separadores de agência/conta.

CREATE TABLE public.import_sm_2026_staging (
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  batch_month date NOT NULL CHECK (extract(day FROM batch_month) = 1 AND extract(year FROM batch_month) = 2026),
  row_no int NOT NULL CHECK (row_no > 0),
  raw jsonb NOT NULL CHECK (jsonb_typeof(raw) = 'object'),
  loaded_at timestamptz DEFAULT now(),
  UNIQUE (company_id, batch_month, row_no)
);
CREATE TABLE public.import_sm_2026_column_map (
  role text PRIMARY KEY CHECK (role IN ('date','amount','direction','agency','account','category',
    'legacy_code','legacy_description','due_date','payment_date','supplier','supplier_doc','event')),
  header text NOT NULL CHECK (btrim(header) <> ''),
  format text
);
CREATE TABLE public.import_sm_2026_category_map (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  legacy_category text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.account_categories(id),
  UNIQUE (company_id, legacy_category)
);
CREATE TABLE public.import_sm_2026_account_map (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  agency text NOT NULL CHECK (btrim(agency) <> ''),
  account text NOT NULL CHECK (btrim(account) <> ''),
  financial_account_id uuid NOT NULL REFERENCES public.financial_accounts(id),
  UNIQUE (company_id, agency, account)
);
-- IDs resolvidos são validados contra a empresa antes de usar; sem FK que bloqueie
-- a remoção de entidades criadas no rollback. O molde create_* permanece para reaplicação.
CREATE TABLE public.import_sm_2026_supplier_map (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  legacy_name text NOT NULL,
  supplier_id uuid,
  create_name text,
  doc text,
  country text CHECK (country ~ '^[A-Z]{2}$'),
  UNIQUE (company_id, legacy_name),
  CHECK (supplier_id IS NOT NULL OR (nullif(btrim(create_name), '') IS NOT NULL AND country IS NOT NULL))
);
CREATE TABLE public.import_sm_2026_event_map (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  legacy_event text NOT NULL,
  event_id uuid,
  create_name text,
  create_date date,
  create_nature text CHECK (create_nature IN ('producao_propria','intermediacao','coproducao','parceiro_local','temporada')),
  no_event boolean NOT NULL DEFAULT false,
  UNIQUE (company_id, legacy_event),
  CHECK (
    (no_event AND event_id IS NULL AND create_name IS NULL AND create_date IS NULL AND create_nature IS NULL)
    OR (NOT no_event AND (event_id IS NOT NULL OR
      (nullif(btrim(create_name), '') IS NOT NULL AND create_date IS NOT NULL AND create_nature IS NOT NULL)))
  )
);
CREATE TABLE public.import_sm_2026_batches (
  batch_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  batch_month date NOT NULL CHECK (extract(day FROM batch_month) = 1 AND extract(year FROM batch_month) = 2026),
  status text NOT NULL CHECK (status IN ('applied','rolled_back')),
  rows int NOT NULL CHECK (rows > 0),
  created_supplier_ids uuid[] NOT NULL DEFAULT '{}',
  created_event_ids uuid[] NOT NULL DEFAULT '{}',
  applied_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz
);
CREATE UNIQUE INDEX import_sm_2026_batches_applied_month
  ON public.import_sm_2026_batches(company_id, batch_month) WHERE status = 'applied';
CREATE TABLE public.import_sm_2026_tx (
  transaction_id uuid PRIMARY KEY REFERENCES public.transactions(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.import_sm_2026_batches(batch_id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  legacy_code text,
  legacy_description text
);
CREATE INDEX import_sm_2026_tx_batch ON public.import_sm_2026_tx(batch_id);

ALTER TABLE public.supplier_similarity_flags DROP CONSTRAINT supplier_similarity_flags_source_check;
ALTER TABLE public.supplier_similarity_flags ADD CONSTRAINT supplier_similarity_flags_source_check
  CHECK (source = ANY (ARRAY['sponsors_import'::text, 'apply_coala_bp'::text, 'backfill_09_10'::text, 'import_sm_2026'::text]));

-- Fecha também os privilégios nominais herdados dos defaults do projecto.
DO $security$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['staging','column_map','category_map','account_map','supplier_map','event_map','batches','tx'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'import_sm_2026_' || t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', 'import_sm_2026_' || t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', 'import_sm_2026_' || t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', 'import_sm_2026_' || t);
    EXECUTE format('CREATE POLICY platform_admin_read ON public.%I FOR SELECT TO authenticated USING (public.is_platform_admin())', 'import_sm_2026_' || t);
  END LOOP;
END;
$security$;
REVOKE ALL ON SEQUENCE public.import_sm_2026_staging_id_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON SEQUENCE public.import_sm_2026_staging_id_seq TO service_role;

CREATE FUNCTION public.import_sm_2026_parse_date(p_value text, p_format text)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE d date; f text := coalesce(p_format, 'YYYY-MM-DD');
BEGIN
  IF nullif(btrim(p_value), '') IS NULL THEN RETURN NULL; END IF;
  IF f NOT IN ('YYYY-MM-DD','DD/MM/YYYY','MM/DD/YYYY') THEN RAISE EXCEPTION 'Formato de data não suportado: %', f; END IF;
  IF (f = 'YYYY-MM-DD' AND p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
     OR (f <> 'YYYY-MM-DD' AND p_value !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$') THEN
    RAISE EXCEPTION 'Data ilegível: %', p_value;
  END IF;
  d := to_date(p_value, f);
  IF to_char(d, f) <> p_value THEN RAISE EXCEPTION 'Data inválida: %', p_value; END IF;
  RETURN d;
END;
$fn$;
REVOKE ALL ON FUNCTION public.import_sm_2026_parse_date(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_sm_2026_parse_date(text,text) TO service_role;

CREATE FUNCTION public.import_sm_2026_apply_batch(p_company_id uuid, p_month date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  r record; m record; v jsonb; parsed jsonb := '[]'; errors jsonb := '[]';
  headers jsonb; formats jsonb; missing text[]; k text; value text;
  dt date; due_dt date; pay_dt date; n numeric; typ text;
  cat_id uuid; acc_id uuid; sup_id uuid; ev_id uuid; tx_id uuid; bid uuid;
  resolution jsonb; row_count int := 0; by_account jsonb;
  created_suppliers uuid[] := '{}'; created_events uuid[] := '{}';
BEGIN
  IF p_month IS NULL OR extract(day FROM p_month) <> 1 OR extract(year FROM p_month) <> 2026 THEN
    RAISE EXCEPTION 'O lote exige o primeiro dia de um mês de 2026';
  END IF;
  -- Uma empresa de cada vez, incluindo rollback; fixa também a moeda durante o lote.
  PERFORM 1 FROM public.companies WHERE id = p_company_id AND currency = 'BRL' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa inexistente ou moeda diferente de BRL'; END IF;
  IF EXISTS (SELECT 1 FROM public.import_sm_2026_batches WHERE company_id = p_company_id AND batch_month = p_month AND status = 'applied') THEN
    RAISE EXCEPTION 'Já existe lote applied neste mês';
  END IF;
  -- Impede mudanças nos mapas/staging entre validação e escrita; não modifica a origem.
  LOCK TABLE public.import_sm_2026_column_map, public.import_sm_2026_category_map,
    public.import_sm_2026_account_map, public.import_sm_2026_supplier_map,
    public.import_sm_2026_event_map, public.import_sm_2026_staging IN SHARE ROW EXCLUSIVE MODE;
  SELECT array_agg(x) INTO missing FROM unnest(ARRAY['date','amount','agency','account','category','legacy_code','legacy_description']) x
    WHERE NOT EXISTS (SELECT 1 FROM public.import_sm_2026_column_map c WHERE c.role = x);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Papéis obrigatórios em falta: %', missing; END IF;
  SELECT jsonb_object_agg(role, header), jsonb_object_agg(role, format) INTO headers, formats FROM public.import_sm_2026_column_map;
  IF NOT EXISTS (SELECT 1 FROM public.import_sm_2026_staging WHERE company_id = p_company_id AND batch_month = p_month) THEN
    RAISE EXCEPTION 'Staging sem linhas para este lote';
  END IF;

  FOR r IN SELECT * FROM public.import_sm_2026_staging WHERE company_id = p_company_id AND batch_month = p_month ORDER BY row_no LOOP
    v := '{}'; dt := NULL; due_dt := NULL; pay_dt := NULL; n := NULL; typ := NULL;
    FOR m IN SELECT role, header FROM public.import_sm_2026_column_map LOOP
      v := v || jsonb_build_object(m.role, nullif(btrim(r.raw ->> m.header), ''));
      -- Cabeçalho em falta é diferente de uma célula opcional vazia.
      IF NOT (r.raw ? m.header) OR jsonb_typeof(r.raw -> m.header) NOT IN ('string','number','null') THEN
        errors := errors || jsonb_build_array(jsonb_build_object('row',r.row_no,'role',m.role,'value',r.raw -> m.header,'error','Cabeçalho ausente ou célula não escalar'));
      END IF;
    END LOOP;
    FOREACH k IN ARRAY ARRAY['date','amount','agency','account','category','legacy_code','legacy_description'] LOOP
      IF v ->> k IS NULL THEN
        errors := errors || jsonb_build_array(jsonb_build_object('row',r.row_no,'role',k,'value',v ->> k,'error','Valor obrigatório'));
      END IF;
    END LOOP;
    FOREACH k IN ARRAY ARRAY['date','due_date','payment_date'] LOOP
      value := v ->> k;
      BEGIN
        IF k = 'date' THEN dt := public.import_sm_2026_parse_date(value, formats ->> k);
        ELSIF k = 'due_date' THEN due_dt := public.import_sm_2026_parse_date(value, formats ->> k);
        ELSE pay_dt := public.import_sm_2026_parse_date(value, formats ->> k); END IF;
      EXCEPTION WHEN OTHERS THEN
        errors := errors || jsonb_build_array(jsonb_build_object('row',r.row_no,'role',k,'value',value,'error',SQLERRM));
      END;
    END LOOP;
    IF dt < p_month OR dt >= (p_month + interval '1 month')::date THEN
      errors := errors || jsonb_build_array(jsonb_build_object('row',r.row_no,'role','date','value',v ->> 'date','error','Data fora do mês do lote'));
    END IF;
    IF pay_dt > current_date THEN
      errors := errors || jsonb_build_array(jsonb_build_object('row',r.row_no,'role','payment_date','value',v ->> 'payment_date','error','Pagamento futuro'));
    END IF;
    value := v ->> 'amount';
    BEGIN
      IF coalesce(formats ->> 'amount', '.') IN ('.','decimal_dot') THEN
        IF value !~ '^[+-]?([0-9]+|[0-9]{1,3}(,[0-9]{3})+)(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'Valor ilegível'; END IF;
        n := replace(value, ',', '')::numeric;
      ELSIF formats ->> 'amount' IN (',','decimal_comma') THEN
        IF value !~ '^[+-]?([0-9]+|[0-9]{1,3}(\.[0-9]{3})+)(,[0-9]{1,2})?$' THEN RAISE EXCEPTION 'Valor ilegível'; END IF;
        n := replace(replace(value, '.', ''), ',', '.')::numeric;
      ELSE RAISE EXCEPTION 'Separador decimal não suportado'; END IF;
      IF n = 0 THEN RAISE EXCEPTION 'Valor zero'; END IF;
    EXCEPTION WHEN OTHERS THEN
      errors := errors || jsonb_build_array(jsonb_build_object('row',r.row_no,'role','amount','value',value,'error',SQLERRM));
    END;
    IF headers ? 'direction' THEN
      typ := v ->> 'direction';
      IF typ IS NULL OR typ NOT IN ('income','expense') OR (n < 0 AND typ = 'income') THEN
        errors := errors || jsonb_build_array(jsonb_build_object('row',r.row_no,'role','direction','value',typ,'error','Direction inválida ou incompatível com o sinal'));
      END IF;
    ELSE typ := CASE WHEN n < 0 THEN 'expense' ELSE 'income' END; END IF;

    SELECT c.id INTO cat_id FROM public.import_sm_2026_category_map cm JOIN public.account_categories c
      ON c.id = cm.category_id AND c.company_id = cm.company_id
      WHERE cm.company_id = p_company_id AND cm.legacy_category = v ->> 'category' FOR SHARE OF c;
    IF cat_id IS NULL THEN
      errors := errors || jsonb_build_array(jsonb_build_object('row',r.row_no,'role','category','value',v ->> 'category','error','Sem mapa válido da empresa'));
    END IF;
    SELECT a.id INTO acc_id FROM public.import_sm_2026_account_map am JOIN public.financial_accounts a
      ON a.id = am.financial_account_id AND a.company_id = am.company_id
      WHERE am.company_id = p_company_id AND am.agency = v ->> 'agency' AND am.account = v ->> 'account'
      FOR SHARE OF a;
    IF acc_id IS NULL THEN
      errors := errors || jsonb_build_array(jsonb_build_object('row',r.row_no,'role','agency+account','value',jsonb_build_array(v ->> 'agency',v ->> 'account'),'error','Sem mapa válido do par na empresa'));
    END IF;
    IF v ->> 'supplier' IS NOT NULL THEN
      SELECT * INTO m FROM public.import_sm_2026_supplier_map WHERE company_id = p_company_id AND legacy_name = v ->> 'supplier';
      IF NOT FOUND OR (m.supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = m.supplier_id AND s.company_id = p_company_id)) THEN
        errors := errors || jsonb_build_array(jsonb_build_object('row',r.row_no,'role','supplier','value',v ->> 'supplier','error','Sem mapa válido da empresa'));
      ELSIF m.doc IS NOT NULL AND v ->> 'supplier_doc' IS NOT NULL AND public.normalize_supplier_nif(m.doc) <> public.normalize_supplier_nif(v ->> 'supplier_doc') THEN
        errors := errors || jsonb_build_array(jsonb_build_object('row',r.row_no,'role','supplier_doc','value',v ->> 'supplier_doc','error','Documento diverge do mapa'));
      END IF;
    END IF;
    SELECT * INTO m FROM public.import_sm_2026_event_map WHERE company_id = p_company_id AND legacy_event = coalesce(v ->> 'event','');
    IF NOT FOUND OR (m.event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = m.event_id AND e.company_id = p_company_id)) THEN
      errors := errors || jsonb_build_array(jsonb_build_object('row',r.row_no,'role','event','value',coalesce(v ->> 'event',''),'error','Sem mapa válido (sem evento exige no_event)'));
    END IF;
    parsed := parsed || jsonb_build_array(v || jsonb_build_object('row_no',r.row_no,'parsed_date',dt,'parsed_due_date',due_dt,
      'parsed_payment_date',pay_dt,'parsed_amount',abs(n),'parsed_type',typ,'category_id',cat_id,'account_id',acc_id));
  END LOOP;
  IF jsonb_array_length(errors) > 0 THEN
    RAISE EXCEPTION USING MESSAGE = 'import_sm_2026: validação falhou: ' || errors::text, DETAIL = errors::text, ERRCODE = '22023';
  END IF;

  INSERT INTO public.import_sm_2026_batches(company_id,batch_month,status,rows)
    VALUES (p_company_id,p_month,'applied',jsonb_array_length(parsed)) RETURNING batch_id INTO bid;
  FOR v IN SELECT * FROM jsonb_array_elements(parsed) LOOP
    sup_id := NULL; ev_id := NULL;
    IF v ->> 'supplier' IS NOT NULL THEN
      SELECT * INTO m FROM public.import_sm_2026_supplier_map WHERE company_id = p_company_id AND legacy_name = v ->> 'supplier';
      sup_id := m.supplier_id;
      IF sup_id IS NULL THEN
        -- País exclusivamente do mapa; nunca da conta bancária nem da empresa.
        resolution := public._supplier_resolve_or_create(p_company_id,m.create_name,coalesce(m.doc,v ->> 'supplier_doc'),'import_sm_2026',m.country);
        sup_id := (resolution ->> 'id')::uuid;
        IF sup_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = sup_id AND s.company_id = p_company_id) THEN
          RAISE EXCEPTION 'Resolvedor devolveu fornecedor inválido';
        END IF;
        IF (resolution ->> 'created')::boolean THEN created_suppliers := array_append(created_suppliers,sup_id); END IF;
        UPDATE public.import_sm_2026_supplier_map SET supplier_id = sup_id WHERE company_id = p_company_id AND legacy_name = v ->> 'supplier';
      END IF;
      PERFORM 1 FROM public.suppliers WHERE id = sup_id AND company_id = p_company_id FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Fornecedor deixou de pertencer à empresa durante o lote'; END IF;
    END IF;
    SELECT * INTO m FROM public.import_sm_2026_event_map WHERE company_id = p_company_id AND legacy_event = coalesce(v ->> 'event','');
    IF NOT m.no_event THEN
      ev_id := m.event_id;
      IF ev_id IS NULL THEN
        INSERT INTO public.events(company_id,name,date,event_nature) VALUES (p_company_id,m.create_name,m.create_date,m.create_nature) RETURNING id INTO ev_id;
        created_events := array_append(created_events,ev_id);
        UPDATE public.import_sm_2026_event_map SET event_id = ev_id WHERE company_id = p_company_id AND legacy_event = coalesce(v ->> 'event','');
      END IF;
      PERFORM 1 FROM public.events WHERE id = ev_id AND company_id = p_company_id FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Evento deixou de pertencer à empresa durante o lote'; END IF;
    END IF;
    INSERT INTO public.transactions(company_id,type,amount,iva_rate,currency,date,due_date,status,paid_amount,
      account_id,category_id,supplier_id,event_id,description)
    VALUES (p_company_id,v ->> 'parsed_type',(v ->> 'parsed_amount')::numeric,0,'BRL',
      (v ->> 'parsed_date')::date,(v ->> 'parsed_due_date')::date,'approved',0,
      (v ->> 'account_id')::uuid,(v ->> 'category_id')::uuid,sup_id,ev_id,v ->> 'legacy_description') RETURNING id INTO tx_id;
    IF v ->> 'parsed_payment_date' IS NOT NULL THEN
      INSERT INTO public.transaction_payments(transaction_id,company_id,account_id,amount,currency,status,payment_date)
      VALUES (tx_id,p_company_id,(v ->> 'account_id')::uuid,(v ->> 'parsed_amount')::numeric,'BRL','paid',(v ->> 'parsed_payment_date')::date);
      IF NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = tx_id AND t.status = 'paid'
        AND t.paid_amount = (v ->> 'parsed_amount')::numeric AND t.payment_date = (v ->> 'parsed_payment_date')::date) THEN
        RAISE EXCEPTION 'Linha %: o pagamento não foi integralmente derivado pelos triggers', v ->> 'row_no';
      END IF;
    END IF;
    INSERT INTO public.import_sm_2026_tx(transaction_id,batch_id,company_id,legacy_code,legacy_description)
      VALUES (tx_id,bid,p_company_id,v ->> 'legacy_code',v ->> 'legacy_description');
    row_count := row_count + 1;
  END LOOP;
  UPDATE public.import_sm_2026_batches SET created_supplier_ids = created_suppliers, created_event_ids = created_events WHERE batch_id = bid;
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.financial_account_id),'[]') INTO by_account FROM (
    SELECT t.account_id AS financial_account_id,count(*) AS rows,
      sum(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END) AS signed_amount,
      sum(CASE WHEN t.type = 'income' THEN t.paid_amount ELSE -t.paid_amount END) AS signed_paid_amount
    FROM public.transactions t JOIN public.import_sm_2026_tx it ON it.transaction_id = t.id WHERE it.batch_id = bid GROUP BY t.account_id
  ) a;
  RETURN jsonb_build_object('batch_id',bid,'rows',row_count,'created_suppliers',to_jsonb(created_suppliers),'created_events',to_jsonb(created_events),'by_account',by_account);
  -- Sem captura de excepções: qualquer trigger faz RAISE com a mensagem original,
  -- revertendo também entidades criadas, mapas resolvidos e registo do lote.
END;
$fn$;
REVOKE ALL ON FUNCTION public.import_sm_2026_apply_batch(uuid,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_sm_2026_apply_batch(uuid,date) TO service_role;

CREATE FUNCTION public.import_sm_2026_batch_close(p_company_id uuid, p_month date)
RETURNS TABLE(financial_account_id uuid, agency text, account text, balance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $fn$
BEGIN
  IF p_month IS NULL OR extract(day FROM p_month) <> 1 OR extract(year FROM p_month) <> 2026 THEN
    RAISE EXCEPTION 'O fecho exige o primeiro dia de um mês de 2026';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id AND currency = 'BRL') THEN
    RAISE EXCEPTION 'Empresa inexistente ou moeda diferente de BRL';
  END IF;
  IF EXISTS (SELECT 1 FROM public.import_sm_2026_account_map m LEFT JOIN public.financial_accounts a
    ON a.id = m.financial_account_id AND a.company_id = m.company_id WHERE m.company_id = p_company_id AND a.id IS NULL) THEN
    RAISE EXCEPTION 'Mapa de contas inválido para a empresa';
  END IF;
  RETURN QUERY
    SELECT m.financial_account_id,m.agency,m.account,b.balance
    FROM public.import_sm_2026_account_map m
    LEFT JOIN public.account_true_balances_asof(
      ARRAY(SELECT DISTINCT am.financial_account_id FROM public.import_sm_2026_account_map am WHERE am.company_id = p_company_id),
      (p_month + interval '1 month' - interval '1 day')::date
    ) b ON b.account_id = m.financial_account_id
    WHERE m.company_id = p_company_id ORDER BY m.agency,m.account;
  -- NULL é mantido (permissão/skip_balance_check), nunca convertido em saldo zero.
END;
$fn$;
REVOKE ALL ON FUNCTION public.import_sm_2026_batch_close(uuid,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_sm_2026_batch_close(uuid,date) TO service_role;

-- Protege também referências ON DELETE CASCADE/SET NULL: uma FK sem RESTRICT
-- não é prova de ausência de uso. As flags de similaridade são apenas metadados do resolvedor.
CREATE FUNCTION public.import_sm_2026_has_references(p_table regclass, p_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE r record; used boolean;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS child_table, a.attname AS child_column
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey,c.confkey) AS keys(child_key,parent_key)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = keys.child_key
    JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = keys.parent_key
    WHERE c.contype = 'f' AND c.confrelid = p_table AND pa.attname = 'id'
      AND c.conrelid <> 'public.supplier_similarity_flags'::regclass
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)',r.child_table,r.child_column) INTO used USING p_id;
    IF used THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END;
$fn$;
REVOKE ALL ON FUNCTION public.import_sm_2026_has_references(regclass,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_sm_2026_has_references(regclass,uuid) TO service_role;

CREATE FUNCTION public.import_sm_2026_rollback_batch(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE b public.import_sm_2026_batches; cid uuid; x uuid; deleted_rows int;
  kept_suppliers uuid[] := '{}'; kept_events uuid[] := '{}';
  deleted_suppliers uuid[] := '{}'; deleted_events uuid[] := '{}';
BEGIN
  SELECT company_id INTO cid FROM public.import_sm_2026_batches WHERE batch_id = p_batch_id;
  IF cid IS NULL THEN RAISE EXCEPTION 'Lote inexistente'; END IF;
  PERFORM 1 FROM public.companies WHERE id = cid FOR UPDATE;
  SELECT * INTO b FROM public.import_sm_2026_batches WHERE batch_id = p_batch_id FOR UPDATE;
  IF b.status <> 'applied' THEN RAISE EXCEPTION 'Lote não está applied'; END IF;
  LOCK TABLE public.import_sm_2026_column_map, public.import_sm_2026_category_map,
    public.import_sm_2026_account_map, public.import_sm_2026_supplier_map,
    public.import_sm_2026_event_map, public.import_sm_2026_staging IN SHARE ROW EXCLUSIVE MODE;
  -- Bloqueia as chaves parentais antes da prova de filhas: uma FK concorrente
  -- não pode entrar entre a verificação e o DELETE e ser arrastada por cascata.
  PERFORM t.id FROM public.transactions t JOIN public.import_sm_2026_tx it ON it.transaction_id = t.id
    WHERE it.batch_id = p_batch_id ORDER BY t.id FOR UPDATE OF t;
  IF EXISTS (SELECT 1 FROM public.import_sm_2026_tx it JOIN public.transactions t ON t.id = it.transaction_id
    WHERE it.batch_id = p_batch_id AND (it.company_id <> b.company_id OR t.company_id <> b.company_id)) THEN
    RAISE EXCEPTION 'Empresa divergente nas transações do lote';
  END IF;
  -- A FK de filhas pode ter ON DELETE CASCADE. Nunca arrastar uma transação
  -- posterior/externa ao lote; neste caso o rollback inteiro deve parar.
  IF EXISTS (
    SELECT 1 FROM public.transactions child
    JOIN public.import_sm_2026_tx parent ON parent.transaction_id = child.parent_transaction_id
    WHERE parent.batch_id = p_batch_id AND NOT EXISTS (
      SELECT 1 FROM public.import_sm_2026_tx own WHERE own.transaction_id = child.id AND own.batch_id = p_batch_id
    )
  ) THEN RAISE EXCEPTION 'Transação do lote tem filha externa: rollback recusado'; END IF;
  DELETE FROM public.transactions t USING public.import_sm_2026_tx it WHERE it.transaction_id = t.id AND it.batch_id = p_batch_id;
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  FOREACH x IN ARRAY b.created_supplier_ids LOOP
    PERFORM 1 FROM public.suppliers WHERE id = x AND company_id = b.company_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF public.import_sm_2026_has_references('public.suppliers',x)
      OR EXISTS (SELECT 1 FROM public.import_sm_2026_supplier_map m WHERE m.supplier_id = x
        AND (m.company_id <> b.company_id OR nullif(btrim(m.create_name),'') IS NULL OR m.country IS NULL)) THEN
      kept_suppliers := array_append(kept_suppliers,x);
    ELSE
      DELETE FROM public.suppliers WHERE id = x AND company_id = b.company_id;
      UPDATE public.import_sm_2026_supplier_map SET supplier_id = NULL WHERE supplier_id = x AND company_id = b.company_id;
      deleted_suppliers := array_append(deleted_suppliers,x);
    END IF;
  END LOOP;
  FOREACH x IN ARRAY b.created_event_ids LOOP
    PERFORM 1 FROM public.events WHERE id = x AND company_id = b.company_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF public.import_sm_2026_has_references('public.events',x)
      OR EXISTS (SELECT 1 FROM public.import_sm_2026_event_map m WHERE m.event_id = x
        AND (m.company_id <> b.company_id OR m.create_name IS NULL OR m.create_date IS NULL OR m.create_nature IS NULL)) THEN
      kept_events := array_append(kept_events,x);
    ELSE
      DELETE FROM public.events WHERE id = x AND company_id = b.company_id;
      UPDATE public.import_sm_2026_event_map SET event_id = NULL WHERE event_id = x AND company_id = b.company_id;
      deleted_events := array_append(deleted_events,x);
    END IF;
  END LOOP;
  UPDATE public.import_sm_2026_batches SET status = 'rolled_back', rolled_back_at = now() WHERE batch_id = p_batch_id;
  RETURN jsonb_build_object('batch_id',p_batch_id,'rows',deleted_rows,'deleted_suppliers',deleted_suppliers,
    'deleted_events',deleted_events,'kept_suppliers',kept_suppliers,'kept_events',kept_events);
END;
$fn$;
REVOKE ALL ON FUNCTION public.import_sm_2026_rollback_batch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_sm_2026_rollback_batch(uuid) TO service_role;
