-- D-ERP288 ajuste (20/10/2026): a linha de BP de cachê (2.1.01) de cada cidade é o tecto; contrato só com o cachê
-- configurado congelado; adiantamento livre só antes de congelar; adiantamentos antigos só com o evento em fecho.
-- Só funções (CREATE OR REPLACE / DROP+CREATE). Sem tabelas, colunas nem dados.
SET LOCAL lock_timeout = '5s';

-- Escolhas de linha por cidade da chamada atual (transação), definidas pelas RPCs públicas.
CREATE OR REPLACE FUNCTION public._cache_guc_choices() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT nullif(current_setting('cache.line_choices', true), '')::jsonb
$$;

DROP FUNCTION IF EXISTS public.create_cache_advance(uuid, uuid, uuid, numeric, date, text, text);
DROP FUNCTION IF EXISTS public.create_cache_payment_contract(uuid, uuid, uuid, numeric, boolean, numeric, date, date, uuid[], text, text);

-- Evento em fecho = raiz com status 'active' e a última data (raiz e cidades) já passada (dia civil de Lisboa).
CREATE OR REPLACE FUNCTION public._cache_event_in_closing(p_root uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT e.status = 'active' FROM public.events e WHERE e.id = p_root), false)
     AND coalesce((SELECT max(e.date) FROM public.events e WHERE e.id = p_root OR e.parent_event_id = p_root)
                  < (now() AT TIME ZONE 'Europe/Lisbon')::date, false)
$$;

-- Linha de cachê por cidade. Ordem: linha cache_module da config do artista (source 'config');
-- senão linha 2.1.01 ativa sem config: escolha explícita (p_choices {event_id: forecast_id}) > linha já usada
-- por contrato/adiantamento deste artista > linha única. Várias sem escolha: forecast_id NULL + candidates.
CREATE OR REPLACE FUNCTION public._cache_resolve_lines(p_root uuid, p_artist uuid, p_choices jsonb DEFAULT NULL)
RETURNS TABLE(event_id uuid, event_name text, event_date date, forecast_id uuid, cap numeric, source text,
              cache_config_id uuid, frozen boolean, candidates jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_company uuid; v_cat uuid; c record; r record; n int; v_raw text; v_choice uuid; v_cand uuid[]; v_pick uuid;
BEGIN
  SELECT e.company_id INTO v_company FROM public.events e WHERE e.id = p_root;
  v_cat := public._cache_category(v_company);
  IF p_choices IS NOT NULL AND jsonb_typeof(p_choices) <> 'object' THEN
    RAISE EXCEPTION 'linha_cache_invalida: escolha de linhas inválida';
  END IF;
  IF p_choices IS NOT NULL AND EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_choices) k
        WHERE k NOT IN (SELECT e.id::text FROM public.events e WHERE e.parent_event_id = p_root
                        UNION ALL SELECT p_root::text WHERE NOT EXISTS (SELECT 1 FROM public.events x WHERE x.parent_event_id = p_root))) THEN
    RAISE EXCEPTION 'linha_cache_invalida: a linha escolhida não pertence a uma cidade deste cachê';
  END IF;
  FOR c IN
    SELECT e.id, e.name, e.date FROM public.events e WHERE e.parent_event_id = p_root
    UNION ALL
    SELECT e.id, e.name, e.date FROM public.events e
     WHERE e.id = p_root AND NOT EXISTS (SELECT 1 FROM public.events x WHERE x.parent_event_id = p_root)
  LOOP
    v_raw := CASE WHEN p_choices IS NULL THEN NULL ELSE nullif(p_choices ->> c.id::text, '') END;
    IF v_raw IS NOT NULL AND v_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'linha_cache_invalida: linha escolhida inválida em %', c.name;
    END IF;
    v_choice := v_raw::uuid;
    n := 0;
    FOR r IN
      SELECT f.id, f.amount, cc.id AS cfg, coalesce(s.is_finalized, cc.is_finalized, false) AS fz
        FROM public.event_forecasts f
        JOIN public.event_cache_configs cc ON cc.id = f.cache_config_id AND cc.supplier_id = p_artist
        LEFT JOIN public.event_cache_city_settlements s ON s.cache_config_id = cc.id AND s.event_id = c.id
       WHERE f.event_id = c.id AND f.formula_type = 'cache_module' AND f.version_id IS NULL
    LOOP
      n := n + 1;
      IF v_choice IS NOT NULL AND v_choice <> r.id THEN
        RAISE EXCEPTION 'linha_cache_invalida: % já tem a linha do cachê configurado', c.name;
      END IF;
      event_id := c.id; event_name := c.name; event_date := c.date; forecast_id := r.id; cap := round(r.amount, 2);
      source := 'config'; cache_config_id := r.cfg; frozen := r.fz; candidates := NULL;
      RETURN NEXT;
    END LOOP;
    CONTINUE WHEN n > 0;

    SELECT array_agg(f.id ORDER BY f.amount DESC, f.id) INTO v_cand
      FROM public.event_forecasts f
     WHERE f.event_id = c.id AND f.category_id = v_cat AND f.version_id IS NULL AND f.cache_config_id IS NULL;
    IF v_cand IS NULL THEN
      IF v_choice IS NOT NULL THEN RAISE EXCEPTION 'linha_cache_invalida: a linha escolhida não é de cachê (2.1.01) ativa em %', c.name; END IF;
      CONTINUE;
    END IF;
    v_pick := NULL;
    IF v_choice IS NOT NULL THEN
      IF NOT (v_choice = ANY (v_cand)) THEN
        RAISE EXCEPTION 'linha_cache_invalida: a linha escolhida não é de cachê (2.1.01) ativa em %', c.name;
      END IF;
      v_pick := v_choice;
    ELSE
      SELECT pc.forecast_id INTO v_pick FROM public.cache_payment_contract_cities pc
        JOIN public.cache_payment_contracts k ON k.id = pc.contract_id
       WHERE k.root_event_id = p_root AND k.artist_supplier_id = p_artist AND k.cancelled_at IS NULL
         AND pc.event_id = c.id AND pc.forecast_id = ANY (v_cand) LIMIT 1;
      IF v_pick IS NULL THEN
        SELECT t.forecast_id INTO v_pick FROM public.transactions t
         WHERE t.cache_role = 'advance' AND t.parent_transaction_id IS NOT NULL AND t.reversed_at IS NULL
           AND t.cache_root_event_id = p_root AND t.cache_artist_supplier_id = p_artist
           AND t.event_id = c.id AND t.forecast_id = ANY (v_cand) LIMIT 1;
      END IF;
      IF v_pick IS NULL AND array_length(v_cand, 1) = 1 THEN v_pick := v_cand[1]; END IF;
    END IF;
    event_id := c.id; event_name := c.name; event_date := c.date; forecast_id := v_pick;
    cap := (SELECT round(f.amount, 2) FROM public.event_forecasts f WHERE f.id = v_pick);
    source := 'bp'; cache_config_id := NULL; frozen := false;
    candidates := CASE WHEN v_pick IS NULL THEN
      (SELECT jsonb_agg(jsonb_build_object('forecast_id', f.id, 'description', f.description, 'amount', f.amount) ORDER BY f.amount DESC, f.id)
         FROM public.event_forecasts f WHERE f.id = ANY (v_cand)) END;
    RETURN NEXT;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._cache_cities_x(p_root uuid, p_artist uuid, p_choices jsonb DEFAULT NULL)
RETURNS TABLE(idx int, event_id uuid, event_name text, event_date date, forecast_id uuid, cap numeric, is_absorber boolean,
              source text, cache_config_id uuid, frozen boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH l AS (SELECT * FROM public._cache_resolve_lines(p_root, p_artist, p_choices) WHERE forecast_id IS NOT NULL),
  ranked AS (
    SELECT l.*, row_number() OVER (ORDER BY l.event_date NULLS LAST, l.event_id) AS i,
           row_number() OVER (ORDER BY l.cap DESC, l.event_date NULLS LAST, l.event_id) AS arank
      FROM l
  )
  SELECT i::int, event_id, event_name, event_date, forecast_id, cap, arank = 1, source, cache_config_id, frozen FROM ranked ORDER BY i
$$;

-- Assinatura antiga preservada; usa as escolhas da chamada atual.
CREATE OR REPLACE FUNCTION public._cache_cities(p_root uuid, p_artist uuid)
RETURNS TABLE(idx int, event_id uuid, event_name text, event_date date, forecast_id uuid, cap numeric, is_absorber boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT idx, event_id, event_name, event_date, forecast_id, cap, is_absorber FROM public._cache_cities_x(p_root, p_artist, public._cache_guc_choices())
$$;

CREATE OR REPLACE FUNCTION public._cache_assert_lines(p_root uuid, p_artist uuid, p_choices jsonb DEFAULT NULL) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_names text;
BEGIN
  SELECT string_agg(r.event_name, ', ' ORDER BY r.event_date) INTO v_names
    FROM public._cache_resolve_lines(p_root, p_artist, p_choices) r WHERE r.forecast_id IS NULL;
  IF v_names IS NOT NULL THEN
    RAISE EXCEPTION 'linha_cache_por_escolher: escolha a linha de cachê do artista em: %', v_names;
  END IF;
END $$;

-- Adiantamentos livres; os antigos (sem papel) só com o evento em fecho.
CREATE OR REPLACE FUNCTION public._cache_free_advances_x(p_root uuid, p_artist uuid, p_choices jsonb DEFAULT NULL)
RETURNS TABLE(tx_id uuid, event_id uuid, amount numeric, legacy boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (SELECT * FROM public._cache_cities_x(p_root, p_artist, p_choices))
  SELECT m.id, ch.event_id, ch.amount, false
    FROM public.transactions m
    JOIN public.transactions ch ON ch.parent_transaction_id = m.id
   WHERE m.cache_role = 'advance' AND m.cache_contract_id IS NULL AND m.event_id IS NULL
     AND m.cache_root_event_id = p_root AND m.cache_artist_supplier_id = p_artist AND m.reversed_at IS NULL
  UNION ALL
  SELECT t.id, t.event_id, t.amount, true
    FROM public.transactions t JOIN c ON c.forecast_id = t.forecast_id
   WHERE t.parent_transaction_id IS NULL AND t.cache_contract_id IS NULL
     AND t.cache_role IS NULL AND t.type = 'expense' AND t.reversed_at IS NULL
     AND COALESCE(t.is_hidden,false) = false
     AND public._cache_event_in_closing(p_root)
$$;

CREATE OR REPLACE FUNCTION public._cache_free_advances(p_root uuid, p_artist uuid)
RETURNS TABLE(tx_id uuid, event_id uuid, amount numeric, legacy boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public._cache_free_advances_x(p_root, p_artist, public._cache_guc_choices())
$$;


CREATE OR REPLACE FUNCTION public.create_cache_payment_contract(
  p_event_id uuid, p_artist_supplier_id uuid, p_beneficiary_supplier_id uuid, p_gross numeric,
  p_withholding_applies boolean, p_withholding_rate numeric, p_withholding_due_date date, p_artist_due_date date,
  p_advance_ids uuid[] DEFAULT '{}', p_label text DEFAULT NULL, p_idempotency_key text DEFAULT NULL, p_line_choices jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := public._cache_assert_actor(); v_root uuid; v_company uuid; v_cid uuid;
BEGIN
  PERFORM set_config('cache.line_choices', coalesce(p_line_choices::text, ''), true);
  SELECT coalesce(parent_event_id, id), company_id INTO v_root, v_company FROM public.events WHERE id = p_event_id;
  IF v_root IS NULL OR v_company <> public.current_company_id() THEN RAISE EXCEPTION 'evento_inexistente'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cache:' || v_root || ':' || p_artist_supplier_id, 0));
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_cid FROM public.cache_payment_contracts WHERE company_id = v_company AND idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN v_cid; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public._cache_resolve_lines(v_root, p_artist_supplier_id, p_line_choices)) THEN
    RAISE EXCEPTION 'sem_linha_cache: não há linha de cachê (2.1.01) no BP desta cidade. Crie-a no BP ou configure o cachê.';
  END IF;
  PERFORM public._cache_assert_lines(v_root, p_artist_supplier_id, p_line_choices);
  IF EXISTS (SELECT 1 FROM public._cache_cities_x(v_root, p_artist_supplier_id, p_line_choices) x WHERE x.source = 'config' AND NOT x.frozen) THEN
    RAISE EXCEPTION 'cache_nao_congelado: Congele primeiro o cachê no modal; só depois pode criar o contrato de pagamento.';
  END IF;
  RETURN public._cache_create_contract(v_uid, v_root, p_artist_supplier_id, p_beneficiary_supplier_id, p_gross,
    p_withholding_applies, p_withholding_rate, p_withholding_due_date, p_artist_due_date, p_advance_ids, p_label, p_idempotency_key);
END $$;

-- Estado do pagamento do cachê para o painel: congelado, em fecho, cidades por escolher.
CREATE OR REPLACE FUNCTION public.cache_contract_status(p_event_id uuid, p_artist_supplier_id uuid, p_line_choices jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_root uuid; v_company uuid;
BEGIN
  SELECT coalesce(parent_event_id, id), company_id INTO v_root, v_company FROM public.events WHERE id = p_event_id;
  IF v_root IS NULL OR auth.uid() IS NULL OR NOT (v_company = public.current_company_id() OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'evento_inexistente';
  END IF;
  RETURN (WITH r AS (SELECT * FROM public._cache_resolve_lines(v_root, p_artist_supplier_id, p_line_choices))
  SELECT jsonb_build_object(
    'root_event_id', v_root,
    'in_closing', public._cache_event_in_closing(v_root),
    'has_config', EXISTS (SELECT 1 FROM r WHERE r.source = 'config'),
    'frozen', EXISTS (SELECT 1 FROM r WHERE r.source = 'config') AND NOT EXISTS (SELECT 1 FROM r WHERE r.source = 'config' AND NOT r.frozen),
    'cities', coalesce((SELECT jsonb_agg(jsonb_build_object('event_id', r.event_id, 'name', r.event_name, 'forecast_id', r.forecast_id,
        'cap', r.cap, 'source', r.source, 'frozen', r.frozen, 'candidates', r.candidates) ORDER BY r.event_date NULLS LAST, r.event_id) FROM r), '[]'::jsonb)));
END $$;

CREATE OR REPLACE FUNCTION public.create_cache_advance(
  p_event_id uuid, p_artist_supplier_id uuid, p_supplier_id uuid, p_amount numeric, p_due_date date,
  p_description text DEFAULT NULL, p_idempotency_key text DEFAULT NULL, p_line_choices jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public._cache_assert_actor(); v_root uuid; v_company uuid; v_cat uuid; v_mother uuid;
  v_events uuid[]; v_lines uuid[]; v_caps numeric[]; v_abs boolean[]; v_names text[]; v_absorber int; v_n int; i int;
  v_total numeric := 0; v_used numeric; v_free numeric; v_alloc numeric[]; v_acc numeric := 0; v_city numeric;
  v_desc text; v_today date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  PERFORM set_config('cache.line_choices', coalesce(p_line_choices::text, ''), true);
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
  IF v_events IS NULL THEN RAISE EXCEPTION 'sem_linha_cache: não há linha de cachê (2.1.01) no BP desta cidade. Crie-a no BP ou configure o cachê.'; END IF;
  PERFORM public._cache_assert_lines(v_root, p_artist_supplier_id, p_line_choices);
  IF EXISTS (SELECT 1 FROM public._cache_cities_x(v_root, p_artist_supplier_id, p_line_choices) x WHERE x.source = 'config' AND x.frozen) THEN
    RAISE EXCEPTION 'cache_ja_congelado: O cachê já está congelado: lance o adiantamento dentro de um contrato.';
  END IF;
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

REVOKE ALL ON FUNCTION public._cache_guc_choices() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cache_event_in_closing(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cache_resolve_lines(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cache_cities_x(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cache_cities(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cache_assert_lines(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cache_free_advances_x(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cache_free_advances(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_cache_payment_contract(uuid, uuid, uuid, numeric, boolean, numeric, date, date, uuid[], text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_cache_advance(uuid, uuid, uuid, numeric, date, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cache_contract_status(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_cache_payment_contract(uuid, uuid, uuid, numeric, boolean, numeric, date, date, uuid[], text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_cache_advance(uuid, uuid, uuid, numeric, date, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cache_contract_status(uuid, uuid, jsonb) TO authenticated;
