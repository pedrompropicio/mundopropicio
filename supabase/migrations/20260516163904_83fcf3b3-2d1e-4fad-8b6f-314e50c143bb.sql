
-- ============================================================
-- FRENTE A: Validação L2 (defesa em profundidade no banco)
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_tx_category_l2_match(
  _tx_category_id uuid,
  _forecast_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fc_cat_id uuid;
  v_tx_l2 uuid;
  v_fc_l2 uuid;
  v_tx_parent uuid;
  v_tx_grand uuid;
  v_fc_parent uuid;
  v_fc_grand uuid;
BEGIN
  -- TX órfã: regra não se aplica
  IF _forecast_id IS NULL THEN RETURN true; END IF;
  IF _tx_category_id IS NULL THEN RETURN true; END IF;

  SELECT category_id INTO v_fc_cat_id
    FROM public.event_forecasts WHERE id = _forecast_id;

  -- BP sem categoria, ou já apagado: não bloquear
  IF v_fc_cat_id IS NULL THEN RETURN true; END IF;
  IF v_fc_cat_id = _tx_category_id THEN RETURN true; END IF;

  -- Resolver L2 da TX (parent se tx é L3, senão a própria)
  SELECT parent_id INTO v_tx_parent FROM public.account_categories WHERE id = _tx_category_id;
  IF v_tx_parent IS NULL THEN
    v_tx_l2 := _tx_category_id; -- tx categoria é L1 (caso raro)
  ELSE
    SELECT parent_id INTO v_tx_grand FROM public.account_categories WHERE id = v_tx_parent;
    v_tx_l2 := COALESCE(v_tx_parent, _tx_category_id);
    -- se tx é L3, parent é L2; se tx é L2, parent é L1 → usar a própria L2
    IF v_tx_grand IS NULL THEN
      v_tx_l2 := _tx_category_id;
    ELSE
      v_tx_l2 := v_tx_parent;
    END IF;
  END IF;

  -- Resolver L2 do BP
  SELECT parent_id INTO v_fc_parent FROM public.account_categories WHERE id = v_fc_cat_id;
  IF v_fc_parent IS NULL THEN
    v_fc_l2 := v_fc_cat_id;
  ELSE
    SELECT parent_id INTO v_fc_grand FROM public.account_categories WHERE id = v_fc_parent;
    IF v_fc_grand IS NULL THEN
      v_fc_l2 := v_fc_cat_id;
    ELSE
      v_fc_l2 := v_fc_parent;
    END IF;
  END IF;

  RETURN v_tx_l2 = v_fc_l2;
END $$;

-- Trigger BEFORE INSERT OR UPDATE OF category_id em transactions
CREATE OR REPLACE FUNCTION public.enforce_tx_category_l2_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_forecast RECORD;
  v_fc_cat RECORD;
  v_l2 RECORD;
BEGIN
  -- Só validar quando categoria muda (ou em INSERT)
  IF TG_OP = 'UPDATE' AND OLD.category_id IS NOT DISTINCT FROM NEW.category_id THEN
    RETURN NEW;
  END IF;
  IF NEW.category_id IS NULL THEN RETURN NEW; END IF;

  -- Existe BP vinculado por FK direta?
  SELECT id, category_id INTO v_forecast
    FROM public.event_forecasts
   WHERE transaction_id = NEW.id
   LIMIT 1;

  IF v_forecast.id IS NULL THEN RETURN NEW; END IF;

  IF public.validate_tx_category_l2_match(NEW.category_id, v_forecast.id) THEN
    RETURN NEW;
  END IF;

  -- Construir mensagem clara
  SELECT c.code, c.name, COALESCE(p.code, c.code) AS l2_code, COALESCE(p.name, c.name) AS l2_name
    INTO v_fc_cat
    FROM public.account_categories c
    LEFT JOIN public.account_categories p ON p.id = c.parent_id
   WHERE c.id = v_forecast.category_id;

  RAISE EXCEPTION 'A transação deve estar dentro da verba prevista no BP. Categoria do BP: % %. Categorias permitidas: L3 debaixo de % %.',
    v_fc_cat.code, v_fc_cat.name, v_fc_cat.l2_code, v_fc_cat.l2_name
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS trg_enforce_tx_category_l2_match ON public.transactions;
CREATE TRIGGER trg_enforce_tx_category_l2_match
  BEFORE INSERT OR UPDATE OF category_id ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tx_category_l2_match();

-- Também disparar quando event_forecasts.transaction_id muda (linkagem nova)
CREATE OR REPLACE FUNCTION public.enforce_forecast_tx_link_l2_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_cat uuid;
  v_fc_cat RECORD;
BEGIN
  IF NEW.transaction_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.transaction_id IS NOT DISTINCT FROM NEW.transaction_id
                       AND OLD.category_id IS NOT DISTINCT FROM NEW.category_id THEN
    RETURN NEW;
  END IF;
  IF NEW.category_id IS NULL THEN RETURN NEW; END IF;

  SELECT category_id INTO v_tx_cat FROM public.transactions WHERE id = NEW.transaction_id;
  IF v_tx_cat IS NULL THEN RETURN NEW; END IF;

  IF public.validate_tx_category_l2_match(v_tx_cat, NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT c.code, c.name, COALESCE(p.code, c.code) AS l2_code, COALESCE(p.name, c.name) AS l2_name
    INTO v_fc_cat
    FROM public.account_categories c
    LEFT JOIN public.account_categories p ON p.id = c.parent_id
   WHERE c.id = NEW.category_id;

  RAISE EXCEPTION 'Não é possível vincular esta transação ao BP: categorias em grupos L2 diferentes. BP: % %. Esperado: L3 debaixo de % %.',
    v_fc_cat.code, v_fc_cat.name, v_fc_cat.l2_code, v_fc_cat.l2_name
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS trg_enforce_forecast_tx_link_l2_match ON public.event_forecasts;
CREATE TRIGGER trg_enforce_forecast_tx_link_l2_match
  BEFORE INSERT OR UPDATE OF transaction_id, category_id ON public.event_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_forecast_tx_link_l2_match();

-- ============================================================
-- FRENTE E: Aprendizado a partir de event_forecasts
-- (espelha coala_capture_category_change)
-- ============================================================

CREATE OR REPLACE FUNCTION public.coala_capture_forecast_category_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fallback_id uuid;
  v_desc_norm text;
  v_src text;
  v_actor uuid;
BEGIN
  IF NEW.category_id IS NULL OR NEW.supplier_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.category_id IS NOT DISTINCT FROM NEW.category_id THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_fallback_id
    FROM public.account_categories
   WHERE company_id = NEW.company_id
     AND code IN ('0.0.99','2.6.08')
   ORDER BY (code = '0.0.99') DESC
   LIMIT 1;
  IF v_fallback_id IS NOT NULL AND NEW.category_id = v_fallback_id THEN
    RETURN NEW;
  END IF;

  v_desc_norm := public.norm_coala_desc(NEW.description);
  IF v_desc_norm IS NULL OR length(v_desc_norm) < 3 THEN RETURN NEW; END IF;

  v_src := COALESCE(NULLIF(current_setting('app.coala_match_source', true), ''), 'bp_edit');
  v_actor := auth.uid();

  INSERT INTO public.coala_supplier_category_map AS m (
    company_id, supplier_id, description_normalized, category_id,
    confirmed_count, matched_via, created_by, last_used_at
  ) VALUES (
    NEW.company_id, NEW.supplier_id, v_desc_norm, NEW.category_id,
    1, v_src, v_actor, now()
  )
  ON CONFLICT (company_id, supplier_id, description_normalized) DO UPDATE
    SET category_id     = EXCLUDED.category_id,
        confirmed_count = CASE
          WHEN m.category_id = EXCLUDED.category_id THEN m.confirmed_count + 1
          ELSE 1
        END,
        matched_via     = EXCLUDED.matched_via,
        last_used_at    = now(),
        updated_at      = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'coala_capture_forecast_category_change failed: %', SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_coala_capture_forecast_category_change ON public.event_forecasts;
CREATE TRIGGER trg_coala_capture_forecast_category_change
  AFTER INSERT OR UPDATE OF category_id ON public.event_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.coala_capture_forecast_category_change();
