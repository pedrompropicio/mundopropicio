-- Contratos de pagamento do cachê com retenção na fonte (revê DR-2026-09-03-D15).
-- Só ADITIVO: tabelas novas, colunas novas NULAS em transactions, índices, funções e invariantes novos.
-- Sem UPDATE/DELETE/INSERT sobre transações ou pagamentos existentes.
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------- tabelas
CREATE TABLE public.cache_payment_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  root_event_id uuid NOT NULL REFERENCES public.events(id),
  artist_supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  beneficiary_supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  label text,
  gross numeric(14,2) NOT NULL CHECK (gross > 0),
  withholding_applies boolean NOT NULL,
  withholding_rate numeric(6,3),
  withholding_amount numeric(14,2) NOT NULL DEFAULT 0,
  withholding_due_date date,
  artist_due_date date,
  advances_amount numeric(14,2) NOT NULL DEFAULT 0,
  artist_mother_id uuid,
  withholding_mother_id uuid,
  idempotency_key text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  replaced_by uuid REFERENCES public.cache_payment_contracts(id),
  CONSTRAINT cache_contract_withholding_shape CHECK (
    (withholding_applies AND withholding_rate > 0 AND withholding_rate < 100 AND withholding_due_date IS NOT NULL)
    OR (NOT withholding_applies AND withholding_rate IS NULL AND withholding_amount = 0)
  )
);
CREATE UNIQUE INDEX cache_payment_contracts_idem ON public.cache_payment_contracts(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX cache_payment_contracts_anchor ON public.cache_payment_contracts(root_event_id, artist_supplier_id) WHERE cancelled_at IS NULL;

CREATE TABLE public.cache_payment_contract_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.cache_payment_contracts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events(id),
  forecast_id uuid NOT NULL,
  cap numeric(14,2) NOT NULL,
  quota numeric(14,2) NOT NULL,
  withholding numeric(14,2) NOT NULL DEFAULT 0,
  advances numeric(14,2) NOT NULL DEFAULT 0,
  artist_balance numeric(14,2) NOT NULL,
  is_absorber boolean NOT NULL DEFAULT false,
  UNIQUE (contract_id, event_id)
);

GRANT SELECT ON public.cache_payment_contracts TO authenticated;
GRANT ALL ON public.cache_payment_contracts TO service_role;
GRANT SELECT ON public.cache_payment_contract_cities TO authenticated;
GRANT ALL ON public.cache_payment_contract_cities TO service_role;
ALTER TABLE public.cache_payment_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cache_payment_contract_cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY cache_contracts_select ON public.cache_payment_contracts FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_platform_admin());
CREATE POLICY cache_contract_cities_select ON public.cache_payment_contract_cities FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_platform_admin());

-- ---------------------------------------------------------------- colunas novas (nulas) em transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS cache_contract_id uuid REFERENCES public.cache_payment_contracts(id),
  ADD COLUMN IF NOT EXISTS cache_role text,
  ADD COLUMN IF NOT EXISTS cache_root_event_id uuid,
  ADD COLUMN IF NOT EXISTS cache_artist_supplier_id uuid;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_cache_role_check
  CHECK (cache_role IS NULL OR cache_role IN ('artist_balance','withholding','advance')) NOT VALID;
CREATE INDEX IF NOT EXISTS transactions_cache_contract_idx ON public.transactions(cache_contract_id) WHERE cache_contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_cache_root_idx ON public.transactions(cache_root_event_id) WHERE cache_root_event_id IS NOT NULL;
COMMENT ON COLUMN public.transactions.cache_role IS 'Papel estrutural no contrato de cachê: artist_balance | withholding | advance. Nunca inferir por fornecedor.';

-- ---------------------------------------------------------------- helpers
CREATE OR REPLACE FUNCTION public.cache_max_contracts() RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 4 $$;

-- Reparte p_total pelos pesos; arredonda ao cêntimo e a posição p_absorber absorve a diferença.
CREATE OR REPLACE FUNCTION public._cache_alloc(p_total numeric, p_weights numeric[], p_absorber int)
RETURNS numeric[] LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_sum numeric := 0; v_acc numeric := 0; v_out numeric[] := '{}'; i int;
BEGIN
  FOR i IN 1..coalesce(array_length(p_weights,1),0) LOOP v_sum := v_sum + p_weights[i]; END LOOP;
  IF v_sum <= 0 THEN RAISE EXCEPTION 'cache_alloc: pesos inválidos'; END IF;
  FOR i IN 1..array_length(p_weights,1) LOOP
    IF i = p_absorber THEN v_out := v_out || 0::numeric;
    ELSE v_out := v_out || round(p_total * p_weights[i] / v_sum, 2); v_acc := v_acc + round(p_total * p_weights[i] / v_sum, 2);
    END IF;
  END LOOP;
  v_out[p_absorber] := round(p_total,2) - v_acc;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public._cache_assert_actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (
    public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'manager'::app_role)
    OR public.has_permission(v_uid, 'manage_transactions')
  ) THEN
    RAISE EXCEPTION 'permission_denied: sem permissão para lançar pagamentos de cachê' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END $$;

-- Cidades (sub-eventos, ou o próprio evento simples) com a linha cache_module do artista.
CREATE OR REPLACE FUNCTION public._cache_cities(p_root uuid, p_artist uuid)
RETURNS TABLE(idx int, event_id uuid, event_name text, event_date date, forecast_id uuid, cap numeric, is_absorber boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cities AS (
    SELECT e.id, e.name, e.date FROM public.events e
     WHERE e.parent_event_id = p_root
    UNION ALL
    SELECT e.id, e.name, e.date FROM public.events e
     WHERE e.id = p_root AND NOT EXISTS (SELECT 1 FROM public.events c WHERE c.parent_event_id = p_root)
  ), lines AS (
    SELECT c.id AS event_id, c.name, c.date, f.id AS forecast_id, f.amount
      FROM cities c
      JOIN public.event_forecasts f ON f.event_id = c.id AND f.formula_type = 'cache_module' AND f.version_id IS NULL
      JOIN public.event_cache_configs cc ON cc.id = f.cache_config_id AND cc.supplier_id = p_artist
  ), ranked AS (
    SELECT l.*, row_number() OVER (ORDER BY l.date NULLS LAST, l.event_id) AS idx,
           row_number() OVER (ORDER BY l.amount DESC, l.date NULLS LAST, l.event_id) AS arank
      FROM lines l
  )
  SELECT idx::int, event_id, name, date, forecast_id, round(amount,2), arank = 1 FROM ranked ORDER BY idx
$$;

CREATE OR REPLACE FUNCTION public._cache_category(p_company uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.account_categories WHERE company_id = p_company AND code = '2.1.01' LIMIT 1
$$;

-- Adiantamentos livres (sem contrato) do artista na turnê/evento, com montante por cidade.
CREATE OR REPLACE FUNCTION public._cache_free_advances(p_root uuid, p_artist uuid)
RETURNS TABLE(tx_id uuid, event_id uuid, amount numeric, legacy boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (SELECT * FROM public._cache_cities(p_root, p_artist))
  -- adiantamentos novos (mãe sem evento + filhas por cidade)
  SELECT m.id, ch.event_id, ch.amount, false
    FROM public.transactions m
    JOIN public.transactions ch ON ch.parent_transaction_id = m.id
   WHERE m.cache_role = 'advance' AND m.cache_contract_id IS NULL AND m.event_id IS NULL
     AND m.cache_root_event_id = p_root AND m.cache_artist_supplier_id = p_artist AND m.reversed_at IS NULL
  UNION ALL
  -- adiantamentos legados diretos na linha da cidade (sem mãe, sem papel)
  SELECT t.id, t.event_id, t.amount, true
    FROM public.transactions t JOIN c ON c.forecast_id = t.forecast_id
   WHERE t.parent_transaction_id IS NULL AND t.cache_contract_id IS NULL
     AND t.cache_role IS NULL AND t.type = 'expense' AND t.reversed_at IS NULL
     AND COALESCE(t.is_hidden,false) = false
$$;

-- ---------------------------------------------------------------- criação (interna)
CREATE OR REPLACE FUNCTION public._cache_create_contract(
  p_uid uuid, p_root uuid, p_artist uuid, p_beneficiary uuid, p_gross numeric,
  p_wh_applies boolean, p_wh_rate numeric, p_wh_due date, p_artist_due date,
  p_advance_ids uuid[], p_label text, p_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_cat uuid; v_at uuid; v_cid uuid; v_n int; v_absorber int;
  v_ids uuid[]; v_events uuid[]; v_names text[]; v_lines uuid[]; v_caps numeric[]; v_abs boolean[];
  v_total_cap numeric := 0; v_used numeric; v_free_other numeric;
  v_quota numeric[]; v_wh numeric[]; v_adv numeric[]; v_art numeric[];
  v_W numeric := 0; v_sum_art numeric := 0; v_sum_adv numeric := 0;
  v_mother uuid; v_wh_mother uuid; v_pct numeric; v_acc numeric; v_first_idx int;
  v_desc_artist text; v_artist_name text; v_contract_no int;
  r record; i int; v_city_other numeric; v_city_free numeric; v_today date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  IF p_key IS NOT NULL THEN
    SELECT id INTO v_cid FROM public.cache_payment_contracts WHERE company_id = v_company AND idempotency_key = p_key;
    IF FOUND THEN RETURN v_cid; END IF;
  END IF;
  IF p_wh_applies IS NULL THEN RAISE EXCEPTION 'retencao_sem_resposta: responda Sim ou Não à retenção IRS'; END IF;
  IF p_wh_applies AND (p_wh_rate IS NULL OR p_wh_rate <= 0 OR p_wh_rate >= 100) THEN RAISE EXCEPTION 'taxa_invalida: taxa de retenção inválida'; END IF;
  IF p_wh_applies AND p_wh_due IS NULL THEN RAISE EXCEPTION 'vencimento_retencao_obrigatorio: indique o vencimento da retenção'; END IF;
  IF p_gross IS NULL OR p_gross <= 0 OR p_gross <> round(p_gross,2) THEN RAISE EXCEPTION 'bruto_invalido: valor bruto inválido'; END IF;
  IF p_beneficiary IS NULL OR NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_beneficiary AND company_id = v_company) THEN
    RAISE EXCEPTION 'beneficiario_invalido: escolha o beneficiário desta empresa';
  END IF;

  SELECT count(*) INTO v_n FROM public.cache_payment_contracts
   WHERE root_event_id = p_root AND artist_supplier_id = p_artist AND cancelled_at IS NULL;
  IF v_n >= public.cache_max_contracts() THEN
    RAISE EXCEPTION 'limite_contratos: máximo de % contratos por cachê', public.cache_max_contracts();
  END IF;
  v_contract_no := v_n + 1;

  v_cat := public._cache_category(v_company);
  IF v_cat IS NULL THEN RAISE EXCEPTION 'categoria_em_falta: rubrica 2.1.01 não existe nesta empresa'; END IF;
  SELECT name INTO v_artist_name FROM public.suppliers WHERE id = p_artist;

  SELECT array_agg(event_id ORDER BY idx), array_agg(event_name ORDER BY idx), array_agg(forecast_id ORDER BY idx),
         array_agg(cap ORDER BY idx), array_agg(is_absorber ORDER BY idx)
    INTO v_events, v_names, v_lines, v_caps, v_abs
    FROM public._cache_cities(p_root, p_artist);
  IF v_events IS NULL THEN RAISE EXCEPTION 'sem_linha_cache: não há linha do cachê no BP das cidades; sincronize o cachê primeiro'; END IF;
  IF (SELECT count(DISTINCT e) FROM unnest(v_events) e) <> array_length(v_events,1) THEN
    RAISE EXCEPTION 'linha_cache_duplicada: uma cidade tem mais de uma linha do cachê deste artista';
  END IF;
  v_n := array_length(v_events,1);
  FOR i IN 1..v_n LOOP v_total_cap := v_total_cap + v_caps[i]; IF v_abs[i] THEN v_absorber := i; END IF; END LOOP;
  IF v_total_cap <= 0 THEN RAISE EXCEPTION 'cache_sem_valor: cachê efetivo é zero'; END IF;

  -- adiantamentos escolhidos
  v_ids := coalesce((SELECT array_agg(DISTINCT x) FROM unnest(p_advance_ids) x), '{}');
  v_adv := array_fill(0::numeric, ARRAY[v_n]);
  FOR r IN SELECT t.* FROM public.transactions t WHERE t.id = ANY(v_ids) ORDER BY t.id FOR UPDATE LOOP NULL; END LOOP;
  IF (SELECT count(*) FROM public.transactions t WHERE t.id = ANY(v_ids)) <> coalesce(array_length(v_ids,1),0) THEN
    RAISE EXCEPTION 'adiantamento_inexistente';
  END IF;
  IF EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = ANY(v_ids) AND t.cache_contract_id IS NOT NULL) THEN
    RAISE EXCEPTION 'adiantamento_ja_associado: um adiantamento já pertence a outro contrato';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE x NOT IN (SELECT tx_id FROM public._cache_free_advances(p_root, p_artist))) THEN
    RAISE EXCEPTION 'adiantamento_invalido: só adiantamentos livres do cachê nas cidades (não lançados no Master)';
  END IF;
  FOR r IN SELECT fa.event_id, sum(fa.amount) AS amt FROM public._cache_free_advances(p_root, p_artist) fa
            WHERE fa.tx_id = ANY(v_ids) GROUP BY fa.event_id LOOP
    i := array_position(v_events, r.event_id);
    v_adv[i] := v_adv[i] + r.amt; v_sum_adv := v_sum_adv + r.amt;
  END LOOP;

  -- teto global
  SELECT coalesce(sum(gross),0) INTO v_used FROM public.cache_payment_contracts
   WHERE root_event_id = p_root AND artist_supplier_id = p_artist AND cancelled_at IS NULL;
  SELECT coalesce(sum(amount),0) INTO v_free_other FROM public._cache_free_advances(p_root, p_artist) WHERE NOT (tx_id = ANY(v_ids));
  IF p_gross + v_used + v_free_other > v_total_cap + 0.005 THEN
    RAISE EXCEPTION 'teto_excedido: bruto % excede o restante por contratar % (cachê efetivo %)',
      p_gross, v_total_cap - v_used - v_free_other, v_total_cap;
  END IF;

  v_quota := public._cache_alloc(p_gross, v_caps, v_absorber);
  IF p_wh_applies THEN
    v_W := round(p_gross * p_wh_rate / 100, 2);
    v_wh := public._cache_alloc(v_W, v_caps, v_absorber);
  ELSE
    v_wh := array_fill(0::numeric, ARRAY[v_n]);
  END IF;
  v_art := array_fill(0::numeric, ARRAY[v_n]);
  FOR i IN 1..v_n LOOP
    v_art[i] := v_quota[i] - v_wh[i] - v_adv[i];
    IF v_art[i] < 0 THEN
      RAISE EXCEPTION 'saldo_negativo: em % os adiantamentos (%) excedem a quota líquida (%) — saldo %',
        v_names[i], v_adv[i], v_quota[i] - v_wh[i], v_art[i];
    END IF;
    SELECT coalesce(sum(cc.quota),0) INTO v_city_other FROM public.cache_payment_contract_cities cc
      JOIN public.cache_payment_contracts k ON k.id = cc.contract_id
     WHERE k.root_event_id = p_root AND k.artist_supplier_id = p_artist AND k.cancelled_at IS NULL AND cc.event_id = v_events[i];
    SELECT coalesce(sum(amount),0) INTO v_city_free FROM public._cache_free_advances(p_root, p_artist)
     WHERE event_id = v_events[i] AND NOT (tx_id = ANY(v_ids));
    IF v_city_other + v_quota[i] + v_city_free > v_caps[i] + 0.005 THEN
      RAISE EXCEPTION 'teto_cidade_excedido: % ficaria com % acima do cachê da cidade %', v_names[i], v_city_other + v_quota[i] + v_city_free, v_caps[i];
    END IF;
    v_sum_art := v_sum_art + v_art[i];
  END LOOP;

  INSERT INTO public.cache_payment_contracts(company_id, root_event_id, artist_supplier_id, beneficiary_supplier_id, label, gross,
      withholding_applies, withholding_rate, withholding_amount, withholding_due_date, artist_due_date, advances_amount, idempotency_key, created_by)
  VALUES (v_company, p_root, p_artist, p_beneficiary, nullif(trim(p_label),''), p_gross,
      p_wh_applies, CASE WHEN p_wh_applies THEN p_wh_rate END, v_W, p_wh_due, p_artist_due, v_sum_adv, p_key, p_uid)
  RETURNING id INTO v_cid;

  FOR i IN 1..v_n LOOP
    INSERT INTO public.cache_payment_contract_cities(contract_id, company_id, event_id, forecast_id, cap, quota, withholding, advances, artist_balance, is_absorber)
    VALUES (v_cid, v_company, v_events[i], v_lines[i], v_caps[i], v_quota[i], v_wh[i], v_adv[i], v_art[i], i = v_absorber);
  END LOOP;

  v_desc_artist := 'Cachê ' || coalesce(v_artist_name,'') || ' — contrato ' || v_contract_no || coalesce(' (' || nullif(trim(p_label),'') || ')','');

  -- mãe de saldo ao artista
  IF v_sum_art > 0 THEN
    INSERT INTO public.transactions(description, type, amount, iva_rate, event_id, category_id, forecast_id, supplier_id, account_id,
        date, due_date, status, paid_amount, split_mode, company_id, cache_contract_id, cache_role, cache_root_event_id, cache_artist_supplier_id)
    VALUES (v_desc_artist || ' — saldo', 'expense', v_sum_art, 0, NULL, v_cat, NULL, p_beneficiary, NULL,
        v_today, p_artist_due, 'approved', 0, 'percentage', v_company, v_cid, 'artist_balance', p_root, p_artist)
    RETURNING id INTO v_mother;
    v_acc := 0; v_first_idx := NULL;
    FOR i IN 1..v_n LOOP
      IF v_art[i] > 0 THEN
        IF v_first_idx IS NULL OR v_art[i] > v_art[v_first_idx] THEN v_first_idx := i; END IF;
      END IF;
    END LOOP;
    FOR i IN 1..v_n LOOP
      IF v_art[i] > 0 THEN
        v_pct := CASE WHEN i = v_first_idx THEN NULL ELSE round(v_art[i] / v_sum_art * 100, 4) END;
        IF v_pct IS NOT NULL THEN v_acc := v_acc + v_pct; END IF;
      END IF;
    END LOOP;
    FOR i IN 1..v_n LOOP
      IF v_art[i] > 0 THEN
        INSERT INTO public.transactions(description, type, amount, iva_rate, event_id, category_id, forecast_id, supplier_id, account_id,
            date, due_date, status, paid_amount, parent_transaction_id, split_percentage, split_mode, company_id,
            cache_contract_id, cache_role, cache_root_event_id, cache_artist_supplier_id)
        VALUES (v_desc_artist || ' — saldo', 'expense', v_art[i], 0, v_events[i], v_cat, v_lines[i], p_beneficiary, NULL,
            v_today, p_artist_due, 'approved', 0, v_mother,
            CASE WHEN i = v_first_idx THEN 100 - v_acc ELSE round(v_art[i] / v_sum_art * 100, 4) END,
            'percentage', v_company, v_cid, 'artist_balance', p_root, p_artist);
      END IF;
    END LOOP;
  END IF;

  -- mãe de retenção IRS (fornecedor AT da empresa da sessão)
  IF p_wh_applies AND v_W > 0 THEN
    SELECT id INTO v_at FROM public.suppliers WHERE company_id = v_company AND name = 'MINISTERIO DAS FINANCAS - IRS' LIMIT 1;
    IF v_at IS NULL THEN RAISE EXCEPTION 'fornecedor_at_em_falta: crie o fornecedor MINISTERIO DAS FINANCAS - IRS nesta empresa'; END IF;
    INSERT INTO public.transactions(description, type, amount, iva_rate, event_id, category_id, forecast_id, supplier_id, account_id,
        date, due_date, status, paid_amount, split_mode, company_id, cache_contract_id, cache_role, cache_root_event_id, cache_artist_supplier_id)
    VALUES ('Retenção IRS ' || p_wh_rate || '% — ' || v_desc_artist, 'expense', v_W, 0, NULL, v_cat, NULL, v_at, NULL,
        v_today, p_wh_due, 'approved', 0, 'percentage', v_company, v_cid, 'withholding', p_root, p_artist)
    RETURNING id INTO v_wh_mother;
    v_acc := 0;
    FOR i IN 1..v_n LOOP
      IF v_wh[i] > 0 AND i <> v_absorber THEN v_acc := v_acc + round(v_wh[i] / v_W * 100, 4); END IF;
    END LOOP;
    FOR i IN 1..v_n LOOP
      IF v_wh[i] > 0 THEN
        INSERT INTO public.transactions(description, type, amount, iva_rate, event_id, category_id, forecast_id, supplier_id, account_id,
            date, due_date, status, paid_amount, parent_transaction_id, split_percentage, split_mode, company_id,
            cache_contract_id, cache_role, cache_root_event_id, cache_artist_supplier_id)
        VALUES ('Retenção IRS ' || p_wh_rate || '% — ' || v_desc_artist, 'expense', v_wh[i], 0, v_events[i], v_cat, v_lines[i], v_at, NULL,
            v_today, p_wh_due, 'approved', 0, v_wh_mother,
            CASE WHEN i = v_absorber THEN 100 - v_acc ELSE round(v_wh[i] / v_W * 100, 4) END,
            'percentage', v_company, v_cid, 'withholding', p_root, p_artist);
      END IF;
    END LOOP;
  END IF;

  UPDATE public.cache_payment_contracts SET artist_mother_id = v_mother, withholding_mother_id = v_wh_mother WHERE id = v_cid;

  -- liga adiantamentos (só colunas de ligação; valores intocados)
  IF array_length(v_ids,1) > 0 THEN
    UPDATE public.transactions SET cache_contract_id = v_cid, cache_role = 'advance',
           cache_root_event_id = p_root, cache_artist_supplier_id = p_artist
     WHERE id = ANY(v_ids) OR parent_transaction_id = ANY(v_ids);
  END IF;
  RETURN v_cid;
END $$;

-- ---------------------------------------------------------------- cancelamento (interno)
CREATE OR REPLACE FUNCTION public._cache_cancel_contract(p_uid uuid, p_contract uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c public.cache_payment_contracts%ROWTYPE; m record; v_by text;
BEGIN
  SELECT * INTO v_c FROM public.cache_payment_contracts WHERE id = p_contract FOR UPDATE;
  IF NOT FOUND OR v_c.company_id <> public.current_company_id() THEN RAISE EXCEPTION 'contrato_inexistente'; END IF;
  IF v_c.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'contrato_ja_cancelado'; END IF;
  PERFORM 1 FROM public.transactions WHERE id IN (v_c.artist_mother_id, v_c.withholding_mother_id) FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.transactions t WHERE t.id IN (v_c.artist_mother_id, v_c.withholding_mother_id)
               AND (t.paid_amount > 0 OR t.status = 'paid'))
     OR EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id IN (v_c.artist_mother_id, v_c.withholding_mother_id))
     OR EXISTS (SELECT 1 FROM public.payment_list_items li JOIN public.payment_lists pl ON pl.id = li.payment_list_id
                 WHERE li.transaction_id IN (v_c.artist_mother_id, v_c.withholding_mother_id) AND li.removed_at IS NULL
                   AND pl.status IN ('approved','partially_approved'))
  THEN
    RAISE EXCEPTION 'contrato_com_pagamento: já há pagamento ou lista aprovada; estorne primeiro pelos fluxos normais';
  END IF;
  SELECT coalesce(email, id::text) INTO v_by FROM auth.users WHERE id = p_uid;
  FOR m IN SELECT t.* FROM public.transactions t WHERE t.id IN (v_c.artist_mother_id, v_c.withholding_mother_id) LOOP
    INSERT INTO public.trash(entity_type, entity_id, entity_data, related_data, deleted_by, company_id)
    VALUES ('transaction', m.id, to_jsonb(m) - 'updated_at',
            jsonb_build_object('transactions', (SELECT coalesce(jsonb_agg(to_jsonb(c) - 'updated_at'), '[]'::jsonb)
                                                  FROM public.transactions c WHERE c.parent_transaction_id = m.id)),
            coalesce(v_by,'sistema'), v_c.company_id);
    DELETE FROM public.transactions WHERE parent_transaction_id = m.id;
    DELETE FROM public.transactions WHERE id = m.id;
  END LOOP;
  UPDATE public.transactions SET cache_contract_id = NULL
   WHERE cache_contract_id = p_contract AND cache_role = 'advance';
  UPDATE public.cache_payment_contracts SET cancelled_at = now(), cancelled_by = p_uid, cancel_reason = p_reason,
         artist_mother_id = NULL, withholding_mother_id = NULL
   WHERE id = p_contract;
END $$;

-- ---------------------------------------------------------------- RPCs públicas
CREATE OR REPLACE FUNCTION public.create_cache_payment_contract(
  p_event_id uuid, p_artist_supplier_id uuid, p_beneficiary_supplier_id uuid, p_gross numeric,
  p_withholding_applies boolean, p_withholding_rate numeric, p_withholding_due_date date, p_artist_due_date date,
  p_advance_ids uuid[] DEFAULT '{}', p_label text DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := public._cache_assert_actor(); v_root uuid; v_company uuid;
BEGIN
  SELECT coalesce(parent_event_id, id), company_id INTO v_root, v_company FROM public.events WHERE id = p_event_id;
  IF v_root IS NULL OR v_company <> public.current_company_id() THEN RAISE EXCEPTION 'evento_inexistente'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cache:' || v_root || ':' || p_artist_supplier_id, 0));
  RETURN public._cache_create_contract(v_uid, v_root, p_artist_supplier_id, p_beneficiary_supplier_id, p_gross,
    p_withholding_applies, p_withholding_rate, p_withholding_due_date, p_artist_due_date, p_advance_ids, p_label, p_idempotency_key);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_cache_payment_breakdown(p_contract_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := public._cache_assert_actor(); v_c record;
BEGIN
  SELECT root_event_id, artist_supplier_id INTO v_c FROM public.cache_payment_contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'contrato_inexistente'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cache:' || v_c.root_event_id || ':' || v_c.artist_supplier_id, 0));
  PERFORM public._cache_cancel_contract(v_uid, p_contract_id, p_reason);
END $$;

-- Alterar = cancelar + recriar numa só operação (só sem pagamento).
CREATE OR REPLACE FUNCTION public.update_cache_payment_contract(
  p_contract_id uuid, p_beneficiary_supplier_id uuid, p_gross numeric,
  p_withholding_applies boolean, p_withholding_rate numeric, p_withholding_due_date date, p_artist_due_date date,
  p_advance_ids uuid[] DEFAULT '{}', p_label text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := public._cache_assert_actor(); v_c record; v_new uuid;
BEGIN
  SELECT root_event_id, artist_supplier_id INTO v_c FROM public.cache_payment_contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'contrato_inexistente'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cache:' || v_c.root_event_id || ':' || v_c.artist_supplier_id, 0));
  PERFORM public._cache_cancel_contract(v_uid, p_contract_id, 'alterado');
  v_new := public._cache_create_contract(v_uid, v_c.root_event_id, v_c.artist_supplier_id, p_beneficiary_supplier_id, p_gross,
    p_withholding_applies, p_withholding_rate, p_withholding_due_date, p_artist_due_date, p_advance_ids, p_label, NULL);
  UPDATE public.cache_payment_contracts SET replaced_by = v_new WHERE id = p_contract_id;
  RETURN v_new;
END $$;

-- Adiantamento livre (antes de definir os contratos), repartido pelas cidades na proporção do cachê.
CREATE OR REPLACE FUNCTION public.create_cache_advance(
  p_event_id uuid, p_artist_supplier_id uuid, p_supplier_id uuid, p_amount numeric, p_due_date date,
  p_description text DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public._cache_assert_actor(); v_root uuid; v_company uuid; v_cat uuid; v_mother uuid;
  v_events uuid[]; v_lines uuid[]; v_caps numeric[]; v_abs boolean[]; v_names text[]; v_absorber int; v_n int; i int;
  v_total numeric := 0; v_used numeric; v_free numeric; v_alloc numeric[]; v_acc numeric := 0; v_city numeric;
  v_desc text; v_today date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  SELECT coalesce(parent_event_id, id), company_id INTO v_root, v_company FROM public.events WHERE id = p_event_id;
  IF v_root IS NULL OR v_company <> public.current_company_id() THEN RAISE EXCEPTION 'evento_inexistente'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cache:' || v_root || ':' || p_artist_supplier_id, 0));
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_mother FROM public.transactions WHERE company_id = v_company AND operation_key = 'cache_adv:' || p_idempotency_key;
    IF FOUND THEN RETURN v_mother; END IF;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount,2) THEN RAISE EXCEPTION 'valor_invalido'; END IF;
  v_cat := public._cache_category(v_company);
  SELECT array_agg(event_id ORDER BY idx), array_agg(forecast_id ORDER BY idx), array_agg(cap ORDER BY idx),
         array_agg(is_absorber ORDER BY idx), array_agg(event_name ORDER BY idx)
    INTO v_events, v_lines, v_caps, v_abs, v_names FROM public._cache_cities(v_root, p_artist_supplier_id);
  IF v_events IS NULL THEN RAISE EXCEPTION 'sem_linha_cache: não há linha do cachê no BP das cidades'; END IF;
  v_n := array_length(v_events,1);
  FOR i IN 1..v_n LOOP v_total := v_total + v_caps[i]; IF v_abs[i] THEN v_absorber := i; END IF; END LOOP;
  SELECT coalesce(sum(gross),0) INTO v_used FROM public.cache_payment_contracts
   WHERE root_event_id = v_root AND artist_supplier_id = p_artist_supplier_id AND cancelled_at IS NULL;
  SELECT coalesce(sum(amount),0) INTO v_free FROM public._cache_free_advances(v_root, p_artist_supplier_id);
  IF p_amount > v_total - v_used - v_free + 0.005 THEN
    RAISE EXCEPTION 'sem_restante_por_contratar: restante %; lance o adiantamento dentro de um contrato', v_total - v_used - v_free;
  END IF;
  v_alloc := public._cache_alloc(p_amount, v_caps, v_absorber);
  FOR i IN 1..v_n LOOP
    SELECT coalesce(sum(cc.quota),0) + coalesce((SELECT sum(amount) FROM public._cache_free_advances(v_root, p_artist_supplier_id) WHERE event_id = v_events[i]),0)
      INTO v_city FROM public.cache_payment_contract_cities cc JOIN public.cache_payment_contracts k ON k.id = cc.contract_id
     WHERE k.root_event_id = v_root AND k.artist_supplier_id = p_artist_supplier_id AND k.cancelled_at IS NULL AND cc.event_id = v_events[i];
    IF v_city + v_alloc[i] > v_caps[i] + 0.005 THEN RAISE EXCEPTION 'teto_cidade_excedido: %', v_names[i]; END IF;
  END LOOP;
  v_desc := coalesce(nullif(trim(p_description),''), 'Adiantamento cachê ' || coalesce((SELECT name FROM public.suppliers WHERE id = p_artist_supplier_id),''));
  INSERT INTO public.transactions(description, type, amount, iva_rate, event_id, category_id, supplier_id, date, due_date, status, paid_amount,
      split_mode, company_id, cache_role, cache_root_event_id, cache_artist_supplier_id, operation_key)
  VALUES (v_desc, 'expense', p_amount, 0, NULL, v_cat, coalesce(p_supplier_id, p_artist_supplier_id), v_today, p_due_date, 'approved', 0,
      'percentage', v_company, 'advance', v_root, p_artist_supplier_id, CASE WHEN p_idempotency_key IS NOT NULL THEN 'cache_adv:' || p_idempotency_key END)
  RETURNING id INTO v_mother;
  FOR i IN 1..v_n LOOP IF i <> v_absorber AND v_alloc[i] > 0 THEN v_acc := v_acc + round(v_alloc[i]/p_amount*100,4); END IF; END LOOP;
  FOR i IN 1..v_n LOOP
    IF v_alloc[i] > 0 THEN
      INSERT INTO public.transactions(description, type, amount, iva_rate, event_id, category_id, forecast_id, supplier_id, date, due_date, status,
          paid_amount, parent_transaction_id, split_percentage, split_mode, company_id, cache_role, cache_root_event_id, cache_artist_supplier_id)
      VALUES (v_desc, 'expense', v_alloc[i], 0, v_events[i], v_cat, v_lines[i], coalesce(p_supplier_id, p_artist_supplier_id), v_today, p_due_date,
          'approved', 0, v_mother, CASE WHEN i = v_absorber THEN 100 - v_acc ELSE round(v_alloc[i]/p_amount*100,4) END,
          'percentage', v_company, 'advance', v_root, p_artist_supplier_id);
    END IF;
  END LOOP;
  RETURN v_mother;
END $$;

-- Adiantamento DEPOIS do contrato: só dentro do contrato, até ao saldo restante da mãe de saldo (menos o já pago).
CREATE OR REPLACE FUNCTION public.add_cache_contract_advance(
  p_contract_id uuid, p_amount numeric, p_due_date date, p_description text DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public._cache_assert_actor(); v_c public.cache_payment_contracts%ROWTYPE; v_m public.transactions%ROWTYPE;
  v_kids uuid[]; v_kamt numeric[]; v_kpaid numeric[]; v_kev uuid[]; v_kline uuid[]; v_alloc numeric[]; v_abs int := 1;
  v_mother uuid; v_acc numeric := 0; i int; v_n int; v_desc text; v_today date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  SELECT * INTO v_c FROM public.cache_payment_contracts WHERE id = p_contract_id;
  IF NOT FOUND OR v_c.company_id <> public.current_company_id() THEN RAISE EXCEPTION 'contrato_inexistente: escolha um contrato'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cache:' || v_c.root_event_id || ':' || v_c.artist_supplier_id, 0));
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_mother FROM public.transactions WHERE company_id = v_c.company_id AND operation_key = 'cache_adv:' || p_idempotency_key;
    IF FOUND THEN RETURN v_mother; END IF;
  END IF;
  SELECT * INTO v_c FROM public.cache_payment_contracts WHERE id = p_contract_id FOR UPDATE;
  IF v_c.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'contrato_cancelado'; END IF;
  IF v_c.artist_mother_id IS NULL THEN RAISE EXCEPTION 'contrato_sem_saldo: o saldo deste contrato já é zero'; END IF;
  SELECT * INTO v_m FROM public.transactions WHERE id = v_c.artist_mother_id FOR UPDATE;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount,2) THEN RAISE EXCEPTION 'valor_invalido'; END IF;
  IF p_amount > v_m.amount - v_m.paid_amount + 0.005 THEN
    RAISE EXCEPTION 'acima_do_saldo: o adiantamento % excede o saldo restante % do contrato', p_amount, v_m.amount - v_m.paid_amount;
  END IF;
  SELECT array_agg(t.id ORDER BY t.amount DESC, t.event_id), array_agg(t.amount ORDER BY t.amount DESC, t.event_id),
         array_agg(t.paid_amount ORDER BY t.amount DESC, t.event_id), array_agg(t.event_id ORDER BY t.amount DESC, t.event_id),
         array_agg(t.forecast_id ORDER BY t.amount DESC, t.event_id)
    INTO v_kids, v_kamt, v_kpaid, v_kev, v_kline
    FROM public.transactions t WHERE t.parent_transaction_id = v_m.id;
  PERFORM 1 FROM public.transactions WHERE id = ANY(v_kids) FOR UPDATE;
  v_n := array_length(v_kids,1);
  v_alloc := public._cache_alloc(p_amount, v_kamt, v_abs);
  FOR i IN 1..v_n LOOP
    IF v_kpaid[i] > v_kamt[i] - v_alloc[i] + 0.005 THEN RAISE EXCEPTION 'acima_do_saldo: parte já paga numa cidade'; END IF;
  END LOOP;
  v_desc := coalesce(nullif(trim(p_description),''), replace(v_m.description, ' — saldo', ' — adiantamento'));
  INSERT INTO public.transactions(description, type, amount, iva_rate, event_id, category_id, supplier_id, date, due_date, status, paid_amount,
      split_mode, company_id, cache_contract_id, cache_role, cache_root_event_id, cache_artist_supplier_id, operation_key)
  VALUES (v_desc, 'expense', p_amount, 0, NULL, v_m.category_id, v_c.beneficiary_supplier_id, v_today, p_due_date, 'approved', 0,
      'percentage', v_c.company_id, v_c.id, 'advance', v_c.root_event_id, v_c.artist_supplier_id,
      CASE WHEN p_idempotency_key IS NOT NULL THEN 'cache_adv:' || p_idempotency_key END)
  RETURNING id INTO v_mother;
  FOR i IN 2..v_n LOOP IF v_alloc[i] > 0 THEN v_acc := v_acc + round(v_alloc[i]/p_amount*100,4); END IF; END LOOP;
  FOR i IN 1..v_n LOOP
    IF v_alloc[i] > 0 THEN
      INSERT INTO public.transactions(description, type, amount, iva_rate, event_id, category_id, forecast_id, supplier_id, date, due_date, status,
          paid_amount, parent_transaction_id, split_percentage, split_mode, company_id, cache_contract_id, cache_role, cache_root_event_id, cache_artist_supplier_id)
      VALUES (v_desc, 'expense', v_alloc[i], 0, v_kev[i], v_m.category_id, v_kline[i], v_c.beneficiary_supplier_id, v_today, p_due_date, 'approved', 0,
          v_mother, CASE WHEN i = 1 THEN 100 - v_acc ELSE round(v_alloc[i]/p_amount*100,4) END, 'percentage', v_c.company_id,
          v_c.id, 'advance', v_c.root_event_id, v_c.artist_supplier_id);
    END IF;
    UPDATE public.cache_payment_contract_cities SET advances = advances + v_alloc[i], artist_balance = artist_balance - v_alloc[i]
     WHERE contract_id = v_c.id AND event_id = v_kev[i];
  END LOOP;
  -- reduz o saldo ao artista (bruto do contrato não muda)
  IF v_m.amount - p_amount <= 0.005 THEN
    DELETE FROM public.transactions WHERE parent_transaction_id = v_m.id;
    DELETE FROM public.transactions WHERE id = v_m.id;
    UPDATE public.cache_payment_contracts SET artist_mother_id = NULL, advances_amount = advances_amount + p_amount WHERE id = v_c.id;
  ELSE
    v_acc := 0;
    FOR i IN 1..v_n LOOP
      IF v_kamt[i] - v_alloc[i] <= 0.005 THEN
        DELETE FROM public.transactions WHERE id = v_kids[i];
      END IF;
    END LOOP;
    FOR i IN 2..v_n LOOP
      IF v_kamt[i] - v_alloc[i] > 0.005 THEN v_acc := v_acc + round((v_kamt[i]-v_alloc[i])/(v_m.amount - p_amount)*100,4); END IF;
    END LOOP;
    FOR i IN 1..v_n LOOP
      IF v_kamt[i] - v_alloc[i] > 0.005 THEN
        UPDATE public.transactions SET amount = v_kamt[i] - v_alloc[i],
               split_percentage = CASE WHEN i = 1 THEN 100 - v_acc ELSE round((v_kamt[i]-v_alloc[i])/(v_m.amount - p_amount)*100,4) END
         WHERE id = v_kids[i];
      END IF;
    END LOOP;
    UPDATE public.transactions SET amount = v_m.amount - p_amount WHERE id = v_m.id;
    UPDATE public.cache_payment_contracts SET advances_amount = advances_amount + p_amount WHERE id = v_c.id;
  END IF;
  RETURN v_mother;
END $$;

-- Leitura: contexto completo para o painel (cidades, tetos, contratos, adiantamentos livres, pago por papel estrutural).
CREATE OR REPLACE FUNCTION public.cache_contract_context(p_event_id uuid, p_artist_supplier_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_root uuid; v_company uuid; v_out jsonb;
BEGIN
  SELECT coalesce(parent_event_id, id), company_id INTO v_root, v_company FROM public.events WHERE id = p_event_id;
  IF v_root IS NULL OR auth.uid() IS NULL OR NOT (v_company = public.current_company_id() OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'evento_inexistente';
  END IF;
  WITH c AS (SELECT * FROM public._cache_cities(v_root, p_artist_supplier_id)),
  rows_ AS (
    SELECT t.event_id, coalesce(t.cache_role, p.cache_role, 'sem_papel') AS role, t.amount, t.paid_amount
      FROM public.transactions t JOIN c ON c.forecast_id = t.forecast_id
      LEFT JOIN public.transactions p ON p.id = t.parent_transaction_id
     WHERE t.type = 'expense' AND t.reversed_at IS NULL AND COALESCE(t.is_hidden,false) = false
       AND t.status IN ('approved','paid')
  )
  SELECT jsonb_build_object(
    'root_event_id', v_root,
    'max_contracts', public.cache_max_contracts(),
    'master_line_warning', EXISTS (
       SELECT 1 FROM public.event_forecasts f JOIN public.event_cache_configs cc ON cc.id = f.cache_config_id
        WHERE f.event_id = v_root AND f.formula_type = 'cache_module' AND f.version_id IS NULL AND cc.supplier_id = p_artist_supplier_id
          AND EXISTS (SELECT 1 FROM public.events ch WHERE ch.parent_event_id = v_root)),
    'cities', coalesce((SELECT jsonb_agg(jsonb_build_object('event_id', c.event_id, 'name', c.event_name, 'date', c.event_date,
        'forecast_id', c.forecast_id, 'cap', c.cap, 'is_absorber', c.is_absorber,
        'by_role', (SELECT coalesce(jsonb_object_agg(role, jsonb_build_object('amount', a, 'paid', pd)), '{}'::jsonb)
                      FROM (SELECT role, sum(amount) a, sum(paid_amount) pd FROM rows_ r WHERE r.event_id = c.event_id GROUP BY role) z)
      ) ORDER BY c.idx) FROM c), '[]'::jsonb),
    'contracts', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', k.id, 'label', k.label, 'gross', k.gross, 'beneficiary_supplier_id', k.beneficiary_supplier_id,
        'beneficiary_name', (SELECT name FROM public.suppliers s WHERE s.id = k.beneficiary_supplier_id),
        'withholding_applies', k.withholding_applies, 'withholding_rate', k.withholding_rate, 'withholding_amount', k.withholding_amount,
        'withholding_due_date', k.withholding_due_date, 'artist_due_date', k.artist_due_date, 'advances_amount', k.advances_amount,
        'created_at', k.created_at,
        'artist_mother', (SELECT jsonb_build_object('id', t.id, 'amount', t.amount, 'paid', t.paid_amount, 'status', t.status) FROM public.transactions t WHERE t.id = k.artist_mother_id),
        'withholding_mother', (SELECT jsonb_build_object('id', t.id, 'amount', t.amount, 'paid', t.paid_amount, 'status', t.status) FROM public.transactions t WHERE t.id = k.withholding_mother_id),
        'has_payment', EXISTS (SELECT 1 FROM public.transactions t WHERE t.id IN (k.artist_mother_id, k.withholding_mother_id) AND (t.paid_amount > 0 OR t.status='paid'))
                    OR EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id IN (k.artist_mother_id, k.withholding_mother_id))
                    OR EXISTS (SELECT 1 FROM public.payment_list_items li JOIN public.payment_lists pl ON pl.id = li.payment_list_id
                                WHERE li.transaction_id IN (k.artist_mother_id, k.withholding_mother_id) AND li.removed_at IS NULL AND pl.status IN ('approved','partially_approved')),
        'advance_ids', (SELECT coalesce(jsonb_agg(t.id), '[]'::jsonb) FROM public.transactions t WHERE t.cache_contract_id = k.id AND t.cache_role = 'advance' AND t.parent_transaction_id IS NULL),
        'cities', (SELECT jsonb_agg(jsonb_build_object('event_id', cc.event_id, 'quota', cc.quota, 'withholding', cc.withholding,
                    'advances', cc.advances, 'artist_balance', cc.artist_balance) ORDER BY cc.event_id) FROM public.cache_payment_contract_cities cc WHERE cc.contract_id = k.id)
      ) ORDER BY k.created_at) FROM public.cache_payment_contracts k
      WHERE k.root_event_id = v_root AND k.artist_supplier_id = p_artist_supplier_id AND k.cancelled_at IS NULL), '[]'::jsonb),
    'free_advances', coalesce((SELECT jsonb_agg(jsonb_build_object('id', g.tx_id, 'amount', g.amt, 'legacy', g.legacy,
        'description', (SELECT description FROM public.transactions WHERE id = g.tx_id),
        'paid', (SELECT paid_amount FROM public.transactions WHERE id = g.tx_id), 'by_city', g.by_city))
      FROM (SELECT fa.tx_id, bool_or(fa.legacy) legacy, sum(fa.amount) amt, jsonb_object_agg(fa.event_id, fa.amount) by_city
              FROM public._cache_free_advances(v_root, p_artist_supplier_id) fa GROUP BY fa.tx_id) g), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END $$;

-- ---------------------------------------------------------------- privilégios
REVOKE ALL ON FUNCTION public._cache_alloc(numeric, numeric[], int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cache_assert_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cache_cities(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cache_category(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cache_free_advances(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cache_create_contract(uuid, uuid, uuid, uuid, numeric, boolean, numeric, date, date, uuid[], text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cache_cancel_contract(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_cache_payment_contract(uuid, uuid, uuid, numeric, boolean, numeric, date, date, uuid[], text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_cache_payment_breakdown(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_cache_payment_contract(uuid, uuid, numeric, boolean, numeric, date, date, uuid[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_cache_advance(uuid, uuid, uuid, numeric, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_cache_contract_advance(uuid, numeric, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cache_contract_context(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_cache_payment_contract(uuid, uuid, uuid, numeric, boolean, numeric, date, date, uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_cache_payment_breakdown(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_cache_payment_contract(uuid, uuid, numeric, boolean, numeric, date, date, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_cache_advance(uuid, uuid, uuid, numeric, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_cache_contract_advance(uuid, numeric, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cache_contract_context(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------- invariantes
CREATE OR REPLACE FUNCTION public._run_invariant_checks_cache_contracts()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE c1 bigint; s1 jsonb; c2 bigint; s2 jsonb; c3 bigint; s3 jsonb;
BEGIN
  -- por cidade: quota = saldo + retenção + adiantamentos do contrato
  WITH got AS (
    SELECT cc.contract_id, cc.event_id, cc.quota,
           coalesce((SELECT sum(t.amount) FROM public.transactions t
                      WHERE t.cache_contract_id = cc.contract_id AND t.event_id = cc.event_id AND t.reversed_at IS NULL
                        AND (t.parent_transaction_id IS NOT NULL OR t.cache_role = 'advance')),0) AS soma
      FROM public.cache_payment_contract_cities cc JOIN public.cache_payment_contracts k ON k.id = cc.contract_id
     WHERE k.cancelled_at IS NULL
  ), bad AS (SELECT * FROM got WHERE abs(quota - soma) > 0.01)
  SELECT count(*), coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM (SELECT * FROM bad LIMIT 6) b), '[]'::jsonb) INTO c1, s1 FROM bad;
  RETURN QUERY SELECT i.name, i.description, i.severity, i.scope, c1, i.reference_count, c1 <= i.reference_count, i.notes, s1
    FROM public.system_invariants i WHERE i.name = 'cache_contrato_cidade_divergente';

  WITH bad AS (SELECT root_event_id, artist_supplier_id, count(*) n FROM public.cache_payment_contracts
                WHERE cancelled_at IS NULL GROUP BY 1,2 HAVING count(*) > public.cache_max_contracts())
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(bad)), '[]'::jsonb) INTO c2, s2 FROM bad;
  RETURN QUERY SELECT i.name, i.description, i.severity, i.scope, c2, i.reference_count, c2 <= i.reference_count, i.notes, s2
    FROM public.system_invariants i WHERE i.name = 'cache_contratos_acima_limite';

  -- mães de contrato sem evento/linha; filhas nunca na linha do Master de turnê; sem campos de retenção declarada
  WITH bad AS (
    SELECT t.id, t.event_id, t.forecast_id FROM public.transactions t
     WHERE t.cache_role IS NOT NULL AND t.cache_contract_id IS NOT NULL AND (
       (t.parent_transaction_id IS NULL AND t.cache_role <> 'advance' AND (t.event_id IS NOT NULL OR t.forecast_id IS NOT NULL))
       OR (t.parent_transaction_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.events ch WHERE ch.parent_event_id = t.event_id))
       OR t.declared_withholding_amount IS NOT NULL OR t.iva_rate <> 0)
  )
  SELECT count(*), coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM (SELECT * FROM bad LIMIT 6) b), '[]'::jsonb) INTO c3, s3 FROM bad;
  RETURN QUERY SELECT i.name, i.description, i.severity, i.scope, c3, i.reference_count, c3 <= i.reference_count, i.notes, s3
    FROM public.system_invariants i WHERE i.name = 'cache_contrato_estrutura_invalida';
END $$;
REVOKE ALL ON FUNCTION public._run_invariant_checks_cache_contracts() FROM PUBLIC, anon, authenticated;

INSERT INTO public.system_invariants(name, description, severity, scope, reference_count, notes) VALUES
 ('cache_contrato_cidade_divergente', 'Contrato de cachê: em cada cidade, saldo + retenção + adiantamentos = quota do contrato', 'error', 'global', 0, 'Revê D15 (20/10/2026)'),
 ('cache_contratos_acima_limite', 'Mais de 4 contratos ativos no mesmo cachê', 'error', 'global', 0, 'MAX_CACHE_CONTRACTS=4'),
 ('cache_contrato_estrutura_invalida', 'Mãe de contrato com evento/linha, filha na linha do Master de turnê, IVA≠0 ou retenção declarada', 'error', 'global', 0, 'Modelo A, D-ERP73')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
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
  UNION ALL SELECT * FROM public._run_invariant_checks_storage()
  UNION ALL SELECT * FROM public._run_invariant_checks_rateio()
  UNION ALL SELECT * FROM public._run_invariant_checks_cash()
  UNION ALL SELECT * FROM public._run_invariant_checks_dre_nature()
  UNION ALL SELECT * FROM public._run_invariant_checks_cache_contracts()
$function$;
